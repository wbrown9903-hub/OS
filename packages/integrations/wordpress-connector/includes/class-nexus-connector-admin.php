<?php
/**
 * The admin screen where the site owner chooses what Nexus may read.
 *
 * @package NexusConnector
 */

declare( strict_types = 1 );

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Renders and saves the sharing choices.
 *
 * Security shape of the save path, in order:
 *   1. `current_user_can( 'manage_options' )` — only an administrator may change this;
 *   2. `check_admin_referer()` — a valid, single-purpose nonce must be present;
 *   3. `wp_unslash()` then `sanitize()` — input is cleaned before it is read;
 *   4. `wp_safe_redirect()` — post/redirect/get so a refresh cannot re-submit.
 *
 * Every value printed back out goes through `esc_html()`, `esc_attr()` or
 * `esc_url()`. There is no `echo $variable` anywhere in this file.
 */
class Nexus_Connector_Admin {

	private const PAGE_SLUG  = 'nexus-connector';
	private const NONCE_NAME = 'nexus_connector_save';

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
	 * Hooks the menu and the save handler.
	 *
	 * @return void
	 */
	public function register_hooks(): void {
		add_action( 'admin_menu', array( $this, 'register_menu' ) );
		add_action( 'admin_post_nexus_connector_save', array( $this, 'handle_save' ) );
	}

	/**
	 * Adds the screen under Settings.
	 *
	 * @return void
	 */
	public function register_menu(): void {
		add_options_page(
			__( 'Nexus Connector', 'nexus-connector' ),
			__( 'Nexus Connector', 'nexus-connector' ),
			'manage_options',
			self::PAGE_SLUG,
			array( $this, 'render' )
		);
	}

	/**
	 * Draws the screen.
	 *
	 * @return void
	 */
	public function render(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to change what this site shares.', 'nexus-connector' ) );
		}

		$settings = $this->settings->all();
		$scopes   = Nexus_Connector_Settings::scopes();
		$saved    = isset( $_GET['nexus-saved'] ) ? sanitize_key( wp_unslash( $_GET['nexus-saved'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only notice flag.
		?>
		<div class="wrap">
			<h1><?php echo esc_html__( 'What Nexus may read', 'nexus-connector' ); ?></h1>

			<?php if ( 'yes' === $saved ) : ?>
				<div class="notice notice-success is-dismissible">
					<p><?php echo esc_html__( 'Saved. Nexus can now read exactly what is ticked below, and nothing else.', 'nexus-connector' ); ?></p>
				</div>
			<?php endif; ?>

			<p>
				<?php echo esc_html__( 'This plugin never changes your site. It only lets Nexus OS read the information you tick here, using the WordPress account that signed in.', 'nexus-connector' ); ?>
			</p>

			<?php if ( ! empty( $settings['last_read_at'] ) ) : ?>
				<p>
					<?php
					printf(
						/* translators: 1: date and time, 2: WordPress username. */
						esc_html__( 'Last read %1$s by %2$s.', 'nexus-connector' ),
						esc_html( wp_date( (string) get_option( 'date_format' ) . ' ' . (string) get_option( 'time_format' ), (int) $settings['last_read_at'] ) ),
						esc_html( (string) $settings['last_read_by'] )
					);
					?>
				</p>
			<?php endif; ?>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="nexus_connector_save" />
				<?php wp_nonce_field( self::NONCE_NAME ); ?>

				<table class="form-table" role="presentation">
					<tbody>
						<tr>
							<th scope="row"><?php echo esc_html__( 'Connector', 'nexus-connector' ); ?></th>
							<td>
								<label for="nexus-enabled">
									<input
										type="checkbox"
										id="nexus-enabled"
										name="enabled"
										value="1"
										<?php checked( ! empty( $settings['enabled'] ) ); ?>
									/>
									<?php echo esc_html__( 'Allow Nexus to use this connector', 'nexus-connector' ); ?>
								</label>
								<p class="description">
									<?php echo esc_html__( 'When this is off, the connector answers every request with “switched off”, whatever is ticked below.', 'nexus-connector' ); ?>
								</p>
							</td>
						</tr>

						<?php foreach ( $scopes as $key => $scope ) : ?>
							<?php $field_id = 'nexus-scope-' . sanitize_html_class( $key ); ?>
							<tr>
								<th scope="row"><?php echo esc_html( $scope['label'] ); ?></th>
								<td>
									<label for="<?php echo esc_attr( $field_id ); ?>">
										<input
											type="checkbox"
											id="<?php echo esc_attr( $field_id ); ?>"
											name="<?php echo esc_attr( 'scope_' . $key ); ?>"
											value="1"
											<?php checked( ! empty( $settings[ 'scope_' . $key ] ) ); ?>
										/>
										<?php echo esc_html__( 'Share this', 'nexus-connector' ); ?>
									</label>
									<p class="description">
										<?php echo esc_html( $scope['description'] ); ?>
										<br />
										<?php
										printf(
											/* translators: %s: WordPress capability name. */
											esc_html__( 'The signed-in account must also have the “%s” permission.', 'nexus-connector' ),
											esc_html( $scope['capability'] )
										);
										?>
									</p>
								</td>
							</tr>
						<?php endforeach; ?>
					</tbody>
				</table>

				<?php submit_button( __( 'Save what is shared', 'nexus-connector' ) ); ?>
			</form>

			<h2><?php echo esc_html__( 'Removing this plugin', 'nexus-connector' ); ?></h2>
			<p>
				<?php echo esc_html__( 'Deleting this plugin removes every setting it created. Nexus will fall back to the standard WordPress API, which only reads what your application password already allows.', 'nexus-connector' ); ?>
			</p>
		</div>
		<?php
	}

	/**
	 * Validates and stores the submitted choices.
	 *
	 * @return void
	 */
	public function handle_save(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to change what this site shares.', 'nexus-connector' ), '', array( 'response' => 403 ) );
		}

		check_admin_referer( self::NONCE_NAME );

		$raw = wp_unslash( $_POST ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- sanitised by Nexus_Connector_Settings::sanitize().

		if ( ! is_array( $raw ) ) {
			$raw = array();
		}

		$this->settings->save( $this->settings->sanitize( $raw ) );

		wp_safe_redirect(
			add_query_arg(
				array(
					'page'        => self::PAGE_SLUG,
					'nexus-saved' => 'yes',
				),
				admin_url( 'options-general.php' )
			)
		);
		exit;
	}
}
