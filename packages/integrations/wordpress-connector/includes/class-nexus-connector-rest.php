<?php
/**
 * The connector's read-only REST endpoints.
 *
 * @package NexusConnector
 */

declare( strict_types = 1 );

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Registers `nexus/v1` routes.
 *
 * There are exactly two, both GET:
 *   /nexus/v1/status   — what this site is willing to share (no content)
 *   /nexus/v1/summary  — the ticked scopes, in one response
 *
 * Every route has a `permission_callback` that checks a real capability. A route
 * without one, or with `__return_true`, would be a security hole; there is none
 * here. There is no POST, PUT, PATCH or DELETE route, by design.
 */
class Nexus_Connector_Rest {

	private const NAMESPACE = 'nexus/v1';

	/**
	 * Settings gateway.
	 *
	 * @var Nexus_Connector_Settings
	 */
	private $settings;

	/**
	 * Constructor.
	 *
	 * @param Nexus_Connector_Settings $settings Settings gateway.
	 */
	public function __construct( Nexus_Connector_Settings $settings ) {
		$this->settings = $settings;
	}

	/**
	 * Hooks route registration.
	 *
	 * @return void
	 */
	public function register_hooks(): void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * Declares the routes.
	 *
	 * @return void
	 */
	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/status',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'handle_status' ),
				'permission_callback' => array( $this, 'can_read_anything' ),
				'args'                => array(),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/summary',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'handle_summary' ),
				'permission_callback' => array( $this, 'can_read_anything' ),
				'args'                => array(
					'scopes' => array(
						'description'       => __( 'Comma-separated scopes to include.', 'nexus-connector' ),
						'type'              => 'string',
						'required'          => false,
						'sanitize_callback' => array( $this, 'sanitize_scope_list' ),
					),
				),
			)
		);
	}

	/**
	 * Baseline permission: the caller must be a logged-in user who can edit
	 * posts. Per-scope capabilities are checked again for each section below.
	 *
	 * @return true|WP_Error
	 */
	public function can_read_anything() {
		if ( ! is_user_logged_in() ) {
			return new WP_Error(
				'nexus_not_logged_in',
				__( 'Sign in with an application password to use the Nexus connector.', 'nexus-connector' ),
				array( 'status' => 401 )
			);
		}

		if ( ! current_user_can( 'edit_posts' ) ) {
			return new WP_Error(
				'nexus_insufficient_role',
				__( 'This account does not have permission to read site information.', 'nexus-connector' ),
				array( 'status' => 403 )
			);
		}

		if ( ! $this->settings->is_enabled() ) {
			return new WP_Error(
				'nexus_connector_disabled',
				__( 'The Nexus connector is installed but switched off. Turn it on under Settings › Nexus Connector.', 'nexus-connector' ),
				array( 'status' => 403 )
			);
		}

		return true;
	}

	/**
	 * Sanitises the `scopes` query parameter into a list of known scope keys.
	 *
	 * @param mixed $value Raw parameter value.
	 * @return array<int,string>
	 */
	public function sanitize_scope_list( $value ): array {
		if ( ! is_string( $value ) || '' === $value ) {
			return array();
		}

		$known     = array_keys( Nexus_Connector_Settings::scopes() );
		$requested = array_map( 'sanitize_key', explode( ',', $value ) );

		return array_values( array_intersect( $requested, $known ) );
	}

	/**
	 * What this site is willing to share. Deliberately contains no content, so
	 * it is safe to call before the owner has ticked anything.
	 *
	 * @return WP_REST_Response
	 */
	public function handle_status(): WP_REST_Response {
		$granted = array();

		foreach ( array_keys( Nexus_Connector_Settings::scopes() ) as $scope ) {
			if ( $this->settings->allows( $scope ) && $this->caller_may( $scope ) ) {
				$granted[] = $scope;
			}
		}

		return rest_ensure_response(
			array(
				'connector_version' => NEXUS_CONNECTOR_VERSION,
				'wordpress_version' => get_bloginfo( 'version' ),
				'site_name'         => get_bloginfo( 'name' ),
				'granted_scopes'    => $granted,
				'woocommerce'       => $this->woocommerce_active(),
				'generated_at'      => gmdate( 'c' ),
			)
		);
	}

	/**
	 * The ticked scopes, in one response.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response
	 */
	public function handle_summary( WP_REST_Request $request ): WP_REST_Response {
		$requested = $request->get_param( 'scopes' );
		$requested = is_array( $requested ) && ! empty( $requested )
			? $requested
			: array_keys( Nexus_Connector_Settings::scopes() );

		$payload = array(
			'generated_at' => gmdate( 'c' ),
			'sections'     => array(),
			'refused'      => array(),
		);

		foreach ( $requested as $scope ) {
			if ( ! $this->settings->allows( $scope ) ) {
				$payload['refused'][ $scope ] = __( 'Not shared. Tick it under Settings › Nexus Connector to share it.', 'nexus-connector' );
				continue;
			}

			if ( ! $this->caller_may( $scope ) ) {
				$payload['refused'][ $scope ] = __( 'This account does not have permission for that information.', 'nexus-connector' );
				continue;
			}

			$section = $this->collect( $scope );

			if ( null !== $section ) {
				$payload['sections'][ $scope ] = $section;
			}
		}

		$user = wp_get_current_user();
		$this->settings->record_read( $user instanceof WP_User ? $user->user_login : '' );

		return rest_ensure_response( $payload );
	}

	/**
	 * Whether the *current* user holds the capability a scope requires.
	 *
	 * @param string $scope Scope key.
	 * @return bool
	 */
	private function caller_may( string $scope ): bool {
		$capability = $this->settings->capability_for( $scope );

		if ( null === $capability ) {
			return false;
		}

		return current_user_can( $capability );
	}

	/**
	 * Gathers one section. Returns null for an unknown scope.
	 *
	 * @param string $scope Scope key.
	 * @return array<string,mixed>|null
	 */
	private function collect( string $scope ) {
		switch ( $scope ) {
			case 'content_counts':
				return $this->content_counts();

			case 'recent_posts':
				return array( 'posts' => $this->posts_by_status( 'publish', 10 ) );

			case 'drafts':
				return array( 'posts' => $this->posts_by_status( 'draft', 10 ) );

			case 'comments':
				return $this->pending_comments();

			case 'updates':
				return $this->available_updates();

			case 'site_health':
				return $this->site_health();

			case 'woocommerce':
				return $this->woocommerce_totals();

			default:
				return null;
		}
	}

	/**
	 * Counts only — no titles, no text.
	 *
	 * @return array<string,int>
	 */
	private function content_counts(): array {
		$posts    = wp_count_posts( 'post' );
		$pages    = wp_count_posts( 'page' );
		$comments = wp_count_comments();

		return array(
			'published_posts'  => isset( $posts->publish ) ? (int) $posts->publish : 0,
			'draft_posts'      => isset( $posts->draft ) ? (int) $posts->draft : 0,
			'pending_posts'    => isset( $posts->pending ) ? (int) $posts->pending : 0,
			'scheduled_posts'  => isset( $posts->future ) ? (int) $posts->future : 0,
			'published_pages'  => isset( $pages->publish ) ? (int) $pages->publish : 0,
			'draft_pages'      => isset( $pages->draft ) ? (int) $pages->draft : 0,
			'pending_comments' => isset( $comments->moderated ) ? (int) $comments->moderated : 0,
			'spam_comments'    => isset( $comments->spam ) ? (int) $comments->spam : 0,
			'media_items'      => (int) array_sum( (array) wp_count_attachments() ),
		);
	}

	/**
	 * Titles, dates and links for one post status.
	 *
	 * @param string $status Post status.
	 * @param int    $limit  Maximum posts.
	 * @return array<int,array<string,string>>
	 */
	private function posts_by_status( string $status, int $limit ): array {
		$query = new WP_Query(
			array(
				'post_type'              => 'post',
				'post_status'            => $status,
				'posts_per_page'         => min( 50, max( 1, $limit ) ),
				'orderby'                => 'date',
				'order'                  => 'DESC',
				'no_found_rows'          => true,
				'update_post_meta_cache' => false,
				'update_post_term_cache' => false,
				'ignore_sticky_posts'    => true,
			)
		);

		$results = array();

		foreach ( $query->posts as $post ) {
			if ( ! $post instanceof WP_Post ) {
				continue;
			}

			$results[] = array(
				'id'           => (string) $post->ID,
				'title'        => wp_strip_all_tags( get_the_title( $post ) ),
				'status'       => (string) $post->post_status,
				'link'         => (string) get_permalink( $post ),
				'published_at' => (string) get_post_time( 'c', true, $post ),
				'modified_at'  => (string) get_post_modified_time( 'c', true, $post ),
			);
		}

		wp_reset_postdata();

		return $results;
	}

	/**
	 * Comments waiting for moderation, trimmed to a short excerpt.
	 *
	 * @return array<string,mixed>
	 */
	private function pending_comments(): array {
		$comments = get_comments(
			array(
				'status' => 'hold',
				'number' => 10,
				'order'  => 'DESC',
			)
		);

		$items = array();

		foreach ( $comments as $comment ) {
			if ( ! $comment instanceof WP_Comment ) {
				continue;
			}

			$items[] = array(
				'id'          => (string) $comment->comment_ID,
				'post_id'     => (string) $comment->comment_post_ID,
				'author_name' => wp_strip_all_tags( (string) $comment->comment_author ),
				'excerpt'     => mb_substr( wp_strip_all_tags( (string) $comment->comment_content ), 0, 240 ),
				'posted_at'   => (string) get_comment_date( 'c', $comment ),
			);
		}

		return array(
			'pending_count' => (int) wp_count_comments()->moderated,
			'comments'      => $items,
		);
	}

	/**
	 * Plugin and theme updates. Names only, never file paths.
	 *
	 * @return array<string,mixed>
	 */
	private function available_updates(): array {
		if ( ! function_exists( 'get_plugin_updates' ) ) {
			require_once ABSPATH . 'wp-admin/includes/update.php';
		}

		$plugin_updates = function_exists( 'get_plugin_updates' ) ? (array) get_plugin_updates() : array();
		$theme_updates  = function_exists( 'get_theme_updates' ) ? (array) get_theme_updates() : array();

		$plugin_names = array();

		foreach ( $plugin_updates as $plugin ) {
			$plugin_names[] = isset( $plugin->Name ) ? wp_strip_all_tags( (string) $plugin->Name ) : __( 'a plugin', 'nexus-connector' ); // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase
		}

		$theme_names = array();

		foreach ( $theme_updates as $theme ) {
			$theme_names[] = $theme instanceof WP_Theme ? wp_strip_all_tags( (string) $theme->get( 'Name' ) ) : __( 'a theme', 'nexus-connector' );
		}

		return array(
			'plugins'      => count( $plugin_names ),
			'themes'       => count( $theme_names ),
			'plugin_names' => $plugin_names,
			'theme_names'  => $theme_names,
			'core'         => $this->core_update_available(),
		);
	}

	/**
	 * Whether a WordPress core update is waiting.
	 *
	 * @return bool
	 */
	private function core_update_available(): bool {
		if ( ! function_exists( 'get_core_updates' ) ) {
			require_once ABSPATH . 'wp-admin/includes/update.php';
		}

		if ( ! function_exists( 'get_core_updates' ) ) {
			return false;
		}

		$updates = get_core_updates();

		if ( ! is_array( $updates ) || empty( $updates[0] ) ) {
			return false;
		}

		return isset( $updates[0]->response ) && 'upgrade' === $updates[0]->response;
	}

	/**
	 * A small, honest site health summary.
	 *
	 * @return array<string,mixed>
	 */
	private function site_health(): array {
		return array(
			'https'          => is_ssl() || 0 === strpos( (string) get_option( 'home' ), 'https://' ),
			'debug_display'  => defined( 'WP_DEBUG_DISPLAY' ) && WP_DEBUG_DISPLAY,
			'php_version'    => PHP_VERSION,
			'wp_version'     => get_bloginfo( 'version' ),
			'core_update'    => $this->core_update_available(),
			'search_engines' => (bool) get_option( 'blog_public' ),
		);
	}

	/**
	 * Whether WooCommerce is genuinely active on this site.
	 *
	 * @return bool
	 */
	private function woocommerce_active(): bool {
		return class_exists( 'WooCommerce' );
	}

	/**
	 * WooCommerce totals for the last 30 days. Money and counts only — never a
	 * customer name, email or address.
	 *
	 * @return array<string,mixed>
	 */
	private function woocommerce_totals(): array {
		if ( ! $this->woocommerce_active() || ! function_exists( 'wc_get_orders' ) ) {
			return array( 'installed' => false );
		}

		$orders = wc_get_orders(
			array(
				'limit'        => 100,
				'status'       => array( 'wc-processing', 'wc-completed' ),
				'date_created' => '>' . ( time() - ( 30 * DAY_IN_SECONDS ) ),
				'return'       => 'objects',
			)
		);

		$total    = 0.0;
		$count    = 0;
		$currency = function_exists( 'get_woocommerce_currency' ) ? get_woocommerce_currency() : '';

		foreach ( (array) $orders as $order ) {
			if ( ! is_object( $order ) || ! method_exists( $order, 'get_total' ) ) {
				continue;
			}

			$total += (float) $order->get_total();
			++$count;
		}

		return array(
			'installed'   => true,
			'currency'    => (string) $currency,
			'order_count' => $count,
			'revenue'     => round( $total, 2 ),
			'window_days' => 30,
		);
	}
}
