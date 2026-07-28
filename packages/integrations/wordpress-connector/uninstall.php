<?php
/**
 * Uninstall routine.
 *
 * WordPress runs this when the plugin is *deleted* (not merely deactivated). It
 * removes every option this plugin created, on single sites and on every site of
 * a multisite network, so nothing is left behind in the database.
 *
 * @package NexusConnector
 */

declare( strict_types = 1 );

// This file is only ever executed by WordPress during deletion.
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

/** Option names this plugin has ever created. Keep in step with the plugin. */
const NEXUS_CONNECTOR_OPTIONS = array(
	'nexus_connector_settings',
);

/**
 * Deletes the plugin's options from the current site.
 *
 * @return void
 */
function nexus_connector_delete_site_options(): void {
	foreach ( NEXUS_CONNECTOR_OPTIONS as $option ) {
		delete_option( $option );
	}
}

if ( is_multisite() ) {
	$site_ids = get_sites(
		array(
			'fields' => 'ids',
			'number' => 0,
		)
	);

	foreach ( (array) $site_ids as $site_id ) {
		switch_to_blog( (int) $site_id );
		nexus_connector_delete_site_options();
		restore_current_blog();
	}

	foreach ( NEXUS_CONNECTOR_OPTIONS as $network_option ) {
		delete_site_option( $network_option );
	}
} else {
	nexus_connector_delete_site_options();
}
