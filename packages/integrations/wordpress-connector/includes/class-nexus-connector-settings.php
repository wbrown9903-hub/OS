<?php
/**
 * The site owner's choices about what Nexus may read.
 *
 * @package NexusConnector
 */

declare( strict_types = 1 );

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Holds, validates and persists the sharing choices.
 *
 * Every scope is off by default. `sanitize()` rebuilds the option from the known
 * scope list rather than trusting the submitted array, so an unexpected key can
 * never become a stored permission.
 */
class Nexus_Connector_Settings {

	/**
	 * The complete set of things Nexus can be permitted to read.
	 *
	 * Each scope names the WordPress capability the *requesting user* must hold,
	 * so ticking a box can never grant more than that account already has.
	 *
	 * @return array<string,array{label:string,description:string,capability:string}>
	 */
	public static function scopes(): array {
		return array(
			'content_counts' => array(
				'label'       => __( 'How much content there is', 'nexus-connector' ),
				'description' => __( 'The number of published posts, drafts, pages and media items. No titles or text.', 'nexus-connector' ),
				'capability'  => 'edit_posts',
			),
			'recent_posts'   => array(
				'label'       => __( 'Recent post titles', 'nexus-connector' ),
				'description' => __( 'The titles, dates and links of your ten most recent posts.', 'nexus-connector' ),
				'capability'  => 'edit_posts',
			),
			'drafts'         => array(
				'label'       => __( 'Draft titles', 'nexus-connector' ),
				'description' => __( 'The titles of unpublished drafts, so Nexus can remind you about them.', 'nexus-connector' ),
				'capability'  => 'edit_posts',
			),
			'comments'       => array(
				'label'       => __( 'Comments awaiting moderation', 'nexus-connector' ),
				'description' => __( 'How many comments are waiting, and a short excerpt of each.', 'nexus-connector' ),
				'capability'  => 'moderate_comments',
			),
			'updates'        => array(
				'label'       => __( 'Available updates', 'nexus-connector' ),
				'description' => __( 'How many plugins and themes have updates available, and their names.', 'nexus-connector' ),
				'capability'  => 'update_plugins',
			),
			'site_health'    => array(
				'label'       => __( 'Site health summary', 'nexus-connector' ),
				'description' => __( 'The overall site health status and any critical issues.', 'nexus-connector' ),
				'capability'  => 'view_site_health_checks',
			),
			'woocommerce'    => array(
				'label'       => __( 'WooCommerce order totals', 'nexus-connector' ),
				'description' => __( 'Order counts and revenue totals. Never customer names or addresses.', 'nexus-connector' ),
				'capability'  => 'manage_woocommerce',
			),
		);
	}

	/**
	 * The safe starting point: nothing shared.
	 *
	 * @return array<string,mixed>
	 */
	public static function minimum_defaults(): array {
		$defaults = array(
			'version'       => NEXUS_CONNECTOR_VERSION,
			'enabled'       => false,
			'last_read_at'  => 0,
			'last_read_by'  => '',
		);

		foreach ( array_keys( self::scopes() ) as $scope ) {
			$defaults[ 'scope_' . $scope ] = false;
		}

		return $defaults;
	}

	/**
	 * Current stored settings, merged over the defaults.
	 *
	 * @return array<string,mixed>
	 */
	public function all(): array {
		$stored = get_option( NEXUS_CONNECTOR_OPTION, array() );

		if ( ! is_array( $stored ) ) {
			$stored = array();
		}

		return array_merge( self::minimum_defaults(), $stored );
	}

	/**
	 * Whether the connector is switched on at all.
	 *
	 * @return bool
	 */
	public function is_enabled(): bool {
		$settings = $this->all();

		return ! empty( $settings['enabled'] );
	}

	/**
	 * Whether a named scope has been ticked by the site owner.
	 *
	 * @param string $scope Scope key.
	 * @return bool
	 */
	public function allows( string $scope ): bool {
		if ( ! $this->is_enabled() ) {
			return false;
		}

		$settings = $this->all();
		$key      = 'scope_' . $scope;

		return isset( $settings[ $key ] ) && true === $settings[ $key ];
	}

	/**
	 * The capability a caller must hold for a scope, or null for an unknown scope.
	 *
	 * @param string $scope Scope key.
	 * @return string|null
	 */
	public function capability_for( string $scope ): ?string {
		$scopes = self::scopes();

		return isset( $scopes[ $scope ] ) ? $scopes[ $scope ]['capability'] : null;
	}

	/**
	 * Rebuilds the option from submitted form data.
	 *
	 * Only known keys survive, and every value is cast — a submitted string of
	 * "1" becomes a real boolean, and an unknown key is dropped entirely.
	 *
	 * @param array<string,mixed> $input Raw $_POST slice, already unslashed.
	 * @return array<string,mixed>
	 */
	public function sanitize( array $input ): array {
		$clean            = self::minimum_defaults();
		$clean['enabled'] = ! empty( $input['enabled'] );

		foreach ( array_keys( self::scopes() ) as $scope ) {
			$key           = 'scope_' . $scope;
			$clean[ $key ] = ! empty( $input[ $key ] );
		}

		$existing             = $this->all();
		$clean['last_read_at'] = isset( $existing['last_read_at'] ) ? absint( $existing['last_read_at'] ) : 0;
		$clean['last_read_by'] = isset( $existing['last_read_by'] ) ? sanitize_text_field( (string) $existing['last_read_by'] ) : '';

		return $clean;
	}

	/**
	 * Persists sanitised settings.
	 *
	 * @param array<string,mixed> $settings Sanitised settings.
	 * @return void
	 */
	public function save( array $settings ): void {
		update_option( NEXUS_CONNECTOR_OPTION, $settings, false );
	}

	/**
	 * Records that Nexus read something, so the owner can see it happening.
	 *
	 * @param string $who Display name of the account that made the request.
	 * @return void
	 */
	public function record_read( string $who ): void {
		$settings                 = $this->all();
		$settings['last_read_at'] = time();
		$settings['last_read_by'] = sanitize_text_field( $who );

		update_option( NEXUS_CONNECTOR_OPTION, $settings, false );
	}
}
