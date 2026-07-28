<?php
/**
 * Plugin Name:       Nexus Connector
 * Plugin URI:        https://nexus.os/help/wordpress
 * Description:       Lets Nexus OS read the parts of this site you choose. Nothing is shared until you tick it, and this plugin never writes to your site.
 * Version:           0.1.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Nexus OS
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       nexus-connector
 * Domain Path:       /languages
 *
 * This plugin is OPTIONAL. Nexus works against the standard WordPress REST API
 * with an application password alone. Installing this adds three things:
 *
 *   1. a single screen where the site owner decides exactly what Nexus may read;
 *   2. one aggregated read-only endpoint, so Nexus makes one request instead of nine;
 *   3. a visible record of what was shared, in the site's own admin.
 *
 * Design rules this file follows, deliberately:
 *   - every permission defaults to OFF (minimum access);
 *   - every endpoint checks a real WordPress capability, never just "is logged in";
 *   - the settings form is nonce-protected and capability-checked on save;
 *   - all input is sanitised on the way in and all output escaped on the way out;
 *   - there is no write endpoint of any kind;
 *   - uninstalling removes every option this plugin created.
 *
 * @package NexusConnector
 */

declare( strict_types = 1 );

// Direct file access is never legitimate.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'NEXUS_CONNECTOR_VERSION', '0.1.0' );
define( 'NEXUS_CONNECTOR_FILE', __FILE__ );
define( 'NEXUS_CONNECTOR_DIR', plugin_dir_path( __FILE__ ) );

/** Option holding the owner's choices. Also listed in uninstall.php. */
define( 'NEXUS_CONNECTOR_OPTION', 'nexus_connector_settings' );

require_once NEXUS_CONNECTOR_DIR . 'includes/class-nexus-connector-settings.php';
require_once NEXUS_CONNECTOR_DIR . 'includes/class-nexus-connector-rest.php';
require_once NEXUS_CONNECTOR_DIR . 'includes/class-nexus-connector-admin.php';

/**
 * Boots the plugin once WordPress is ready.
 *
 * @return void
 */
function nexus_connector_bootstrap(): void {
	$settings = new Nexus_Connector_Settings();

	( new Nexus_Connector_Rest( $settings ) )->register_hooks();

	if ( is_admin() ) {
		( new Nexus_Connector_Admin( $settings ) )->register_hooks();
	}
}
add_action( 'plugins_loaded', 'nexus_connector_bootstrap' );

/**
 * Writes the safe defaults on activation.
 *
 * Everything is off. A freshly installed connector shares nothing at all until
 * the site owner opens the screen and ticks a box.
 *
 * @return void
 */
function nexus_connector_activate(): void {
	if ( false === get_option( NEXUS_CONNECTOR_OPTION, false ) ) {
		add_option( NEXUS_CONNECTOR_OPTION, Nexus_Connector_Settings::minimum_defaults(), '', 'no' );
	}
}
register_activation_hook( __FILE__, 'nexus_connector_activate' );

/**
 * Adds a "Settings" link on the Plugins screen so the choice screen is findable.
 *
 * @param array<int,string> $links Existing action links.
 * @return array<int,string>
 */
function nexus_connector_action_links( array $links ): array {
	$url = admin_url( 'options-general.php?page=nexus-connector' );

	array_unshift(
		$links,
		sprintf(
			'<a href="%1$s">%2$s</a>',
			esc_url( $url ),
			esc_html__( 'What Nexus may read', 'nexus-connector' )
		)
	);

	return $links;
}
add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), 'nexus_connector_action_links' );
