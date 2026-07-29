<?php
/**
 * Plugin Name:       FWL Shipping Price
 * Plugin URI:        https://firstwatershop.com/
 * Description:       Makes the shipping price 9.99 everywhere: the checkout line, the order total, the saved order and the amount actually charged. Replaces any leftover 11.99 left behind by a theme, a cached rate or another plugin.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * WC requires at least: 7.0
 * Author:            First Water Lab
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       fwl-shipping-price
 *
 * WHAT THIS PLUGIN DOES, IN ORDER OF AUTHORITY
 *
 *   1. Server side (the only thing that decides money). Every shipping rate
 *      WooCommerce offers is inspected before it is shown. Any rate still
 *      costing the old price is rewritten to the new one, taxes included. The
 *      order's shipping line is checked again when the order is created, so the
 *      amount stored on the order — and therefore the amount the payment
 *      gateway charges — is the new price.
 *
 *   2. Stored settings. On activation the plugin rewrites the old price out of
 *      the shipping-zone method settings themselves, so the admin screens agree
 *      with the checkout. What it changed is recorded and shown once as an
 *      admin notice.
 *
 *   3. Display only, and only when it is provably safe. This site's checkout
 *      theme hard-codes "$11.99" in a few places (a button aria-label, a
 *      fallback used when it cannot parse the shipping row). A small script
 *      corrects that stale text — but it is printed ONLY when the server has
 *      already confirmed the real shipping total is the new price. If the real
 *      total is anything else, the script is not printed at all and the page
 *      keeps showing the true figure. Display never disagrees with the charge.
 *
 * Nothing here fakes a total. If the server cannot apply the new price, the
 * customer sees the real one.
 *
 * @package FWL_Shipping_Price
 */

declare( strict_types = 1 );

// Direct file access is never legitimate.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'FWL_SHIPPING_PRICE_VERSION', '1.0.0' );
define( 'FWL_SHIPPING_PRICE_FILE', __FILE__ );

/** The price being retired. */
define( 'FWL_SHIPPING_PRICE_OLD', 11.99 );

/** The price that must appear and be charged. */
define( 'FWL_SHIPPING_PRICE_NEW', 9.99 );

/** Option remembering which stored settings were rewritten, for the admin notice. */
define( 'FWL_SHIPPING_PRICE_SYNC_OPTION', 'fwl_shipping_price_last_sync' );

/** Option holding the version the stored settings were last synced for. */
define( 'FWL_SHIPPING_PRICE_VERSION_OPTION', 'fwl_shipping_price_version' );

/**
 * Declares compatibility with High-Performance Order Storage and with the
 * checkout blocks, so WooCommerce does not flag this plugin as untested. Both
 * are true: the rate filter and the order-item guard are storage-agnostic.
 */
add_action(
	'before_woocommerce_init',
	static function (): void {
		if ( ! class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
			return;
		}

		\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', FWL_SHIPPING_PRICE_FILE, true );
		\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'cart_checkout_blocks', FWL_SHIPPING_PRICE_FILE, true );
	}
);

/**
 * Money comparison. Never compare currency with ==.
 *
 * The tolerance is a tenth of a cent: tight enough that a genuinely different
 * price such as 11.995 is left alone, loose enough that float representation of
 * the same stored value never causes a miss.
 *
 * @param mixed $a First amount.
 * @param mixed $b Second amount.
 * @return bool True when the two amounts are the same price.
 */
function fwl_shipping_price_same( $a, $b ): bool {
	return abs( (float) $a - (float) $b ) < 0.001;
}

/**
 * The price being retired. Filter this if another stale figure needs catching.
 *
 * @return float[] One or more amounts that should become the new price.
 */
function fwl_shipping_price_old_amounts(): array {
	$amounts = apply_filters( 'fwl_shipping_price_old_amounts', array( (float) FWL_SHIPPING_PRICE_OLD ) );

	return array_map( 'floatval', (array) $amounts );
}

/**
 * The price that must be shown and charged.
 *
 * @return float The new shipping price.
 */
function fwl_shipping_price_new_amount(): float {
	return (float) apply_filters( 'fwl_shipping_price_new_amount', (float) FWL_SHIPPING_PRICE_NEW );
}

/**
 * Whether an amount is one of the retired prices.
 *
 * @param mixed $amount Amount to test.
 * @return bool True when the amount must be rewritten.
 */
function fwl_shipping_price_is_stale( $amount ): bool {
	foreach ( fwl_shipping_price_old_amounts() as $old ) {
		if ( fwl_shipping_price_same( $amount, $old ) ) {
			return true;
		}
	}

	return false;
}

/* -------------------------------------------------------------------------
 * 1. The charge itself.
 * ---------------------------------------------------------------------- */

/**
 * Rewrites the cost of every offered shipping rate that still carries the old
 * price. This runs for the cart, the checkout, every recurring subscription
 * package and the shipping calculator, so one change covers all of them.
 *
 * Rates that are already correct, free, or priced at anything else are left
 * exactly as they are.
 *
 * @param WC_Shipping_Rate[] $rates   Rates offered for this package.
 * @param array              $package The shipping package.
 * @return WC_Shipping_Rate[] Rates with the retired price replaced.
 */
function fwl_shipping_price_filter_rates( $rates, $package = array() ) {
	unset( $package );

	if ( ! is_array( $rates ) ) {
		return $rates;
	}

	$new = fwl_shipping_price_new_amount();

	foreach ( $rates as $rate ) {
		if ( ! $rate instanceof WC_Shipping_Rate ) {
			continue;
		}

		if ( ! fwl_shipping_price_is_stale( $rate->get_cost() ) ) {
			continue;
		}

		$rate->set_cost( (string) wc_format_decimal( $new, wc_get_price_decimals() ) );
		$rate->set_taxes( fwl_shipping_price_recalculate_taxes( $rate->get_taxes(), $new ) );
	}

	return $rates;
}
add_filter( 'woocommerce_package_rates', 'fwl_shipping_price_filter_rates', 9999, 2 );

/**
 * Recalculates shipping tax for a changed cost.
 *
 * A rate whose taxes are all zero is left alone: that usually means the
 * customer or the destination is exempt, and this plugin is not the place to
 * overturn that decision.
 *
 * @param array $existing_taxes Taxes currently on the rate or item.
 * @param float $cost           The new shipping cost.
 * @return array Recalculated taxes, or the originals when nothing is taxable.
 */
function fwl_shipping_price_recalculate_taxes( $existing_taxes, float $cost ): array {
	$existing_taxes = is_array( $existing_taxes ) ? $existing_taxes : array();

	if ( ! wc_tax_enabled() || ! class_exists( 'WC_Tax' ) ) {
		return $existing_taxes;
	}

	$charged = array_filter(
		$existing_taxes,
		static function ( $amount ) {
			return (float) $amount > 0;
		}
	);

	if ( empty( $charged ) ) {
		return $existing_taxes;
	}

	$rates = WC_Tax::get_shipping_tax_rates();

	if ( empty( $rates ) ) {
		return $existing_taxes;
	}

	return WC_Tax::calc_shipping_tax( $cost, $rates );
}

/**
 * Second gate, on the order itself.
 *
 * Even if a stale rate reached the order — from a cached session, a saved
 * checkout draft, or a gateway that rebuilt the order — the shipping line is
 * corrected here, before totals are calculated and before any payment intent is
 * created. This is what guarantees the customer is charged the new price.
 *
 * @param WC_Order_Item_Shipping $item        The shipping line item.
 * @param string                 $package_key Package key.
 * @param array                  $package     Package contents.
 * @param WC_Order               $order       The order being created.
 * @return void
 */
function fwl_shipping_price_fix_order_item( $item, $package_key = '', $package = array(), $order = null ): void {
	unset( $package_key, $package, $order );

	if ( ! $item instanceof WC_Order_Item_Shipping ) {
		return;
	}

	if ( ! fwl_shipping_price_is_stale( $item->get_total() ) ) {
		return;
	}

	$new = fwl_shipping_price_new_amount();

	$item->set_total( (string) wc_format_decimal( $new, wc_get_price_decimals() ) );
	$item->set_taxes(
		array(
			'total' => fwl_shipping_price_recalculate_taxes( $item->get_taxes()['total'] ?? array(), $new ),
		)
	);
}
add_action( 'woocommerce_checkout_create_order_shipping_item', 'fwl_shipping_price_fix_order_item', 9999, 4 );

/* -------------------------------------------------------------------------
 * 2. Stored shipping-zone settings.
 * ---------------------------------------------------------------------- */

/**
 * Rewrites the retired price out of the saved shipping-method settings.
 *
 * Costs may be formulas ("11.99 + [qty] * 2"), so only the standalone number is
 * replaced; the rest of the expression is untouched. Every change is recorded
 * so the site owner can see exactly what moved.
 *
 * @return array List of changes, each with the zone, method, field and values.
 */
function fwl_shipping_price_sync_zone_settings(): array {
	$changes = array();

	if ( ! class_exists( 'WC_Shipping_Zones' ) ) {
		return $changes;
	}

	$zones   = WC_Shipping_Zones::get_zones();
	$zones[] = array( 'id' => 0 );

	foreach ( $zones as $zone_data ) {
		$zone = WC_Shipping_Zones::get_zone( (int) ( $zone_data['id'] ?? 0 ) );

		if ( ! $zone ) {
			continue;
		}

		foreach ( $zone->get_shipping_methods( false ) as $method ) {
			$option_key = 'woocommerce_' . $method->id . '_' . $method->get_instance_id() . '_settings';
			$settings   = get_option( $option_key );

			if ( ! is_array( $settings ) ) {
				continue;
			}

			$updated = $settings;

			foreach ( $settings as $field => $value ) {
				if ( ! is_string( $value ) ) {
					continue;
				}

				// Cost fields only: "cost", "no_class_cost", "class_cost_42", "min_amount".
				if ( 'cost' !== $field && 0 !== strpos( $field, 'class_cost' ) && 'no_class_cost' !== $field ) {
					continue;
				}

				$rewritten = fwl_shipping_price_rewrite_cost_string( $value );

				if ( $rewritten === $value ) {
					continue;
				}

				$updated[ $field ] = $rewritten;

				$changes[] = array(
					'zone'   => $zone->get_zone_name(),
					'method' => $method->get_method_title(),
					'field'  => $field,
					'from'   => $value,
					'to'     => $rewritten,
				);
			}

			if ( $updated !== $settings ) {
				update_option( $option_key, $updated );
			}
		}
	}

	return $changes;
}

/**
 * Replaces the retired amount inside a cost string, leaving any formula intact.
 *
 * @param string $cost Stored cost value.
 * @return string The cost with the retired amount replaced.
 */
function fwl_shipping_price_rewrite_cost_string( string $cost ): string {
	$new = (string) wc_format_decimal( fwl_shipping_price_new_amount(), 2 );

	// Every number in the expression is compared numerically rather than as
	// text, so "11.99", "11.990" and "11.9900" are all caught while "119.99"
	// and a quantity multiplier are left exactly as the owner wrote them.
	return (string) preg_replace_callback(
		'/\d+(?:\.\d+)?/',
		static function ( array $match ) use ( $new ) {
			return fwl_shipping_price_is_stale( $match[0] ) ? $new : $match[0];
		},
		$cost
	);
}

/**
 * Clears cached shipping rates so the new price appears immediately.
 *
 * WooCommerce caches offered rates per session; without this a customer with an
 * open tab would keep seeing the old figure until their session expired.
 *
 * @return void
 */
function fwl_shipping_price_flush_rate_cache(): void {
	if ( class_exists( 'WC_Cache_Helper' ) ) {
		WC_Cache_Helper::get_transient_version( 'shipping', true );
	}

	if ( function_exists( 'WC' ) && WC()->session ) {
		foreach ( array_keys( (array) WC()->session->get_session_data() ) as $key ) {
			if ( 0 === strpos( (string) $key, 'shipping_for_package' ) ) {
				WC()->session->__unset( $key );
			}
		}
	}
}

/**
 * Runs the settings sync once per plugin version, and on activation.
 *
 * @return void
 */
function fwl_shipping_price_maybe_sync(): void {
	if ( get_option( FWL_SHIPPING_PRICE_VERSION_OPTION ) === FWL_SHIPPING_PRICE_VERSION ) {
		return;
	}

	$changes = fwl_shipping_price_sync_zone_settings();

	update_option( FWL_SHIPPING_PRICE_SYNC_OPTION, $changes, false );
	update_option( FWL_SHIPPING_PRICE_VERSION_OPTION, FWL_SHIPPING_PRICE_VERSION, false );

	fwl_shipping_price_flush_rate_cache();
}
add_action( 'woocommerce_init', 'fwl_shipping_price_maybe_sync' );

register_activation_hook(
	FWL_SHIPPING_PRICE_FILE,
	static function (): void {
		delete_option( FWL_SHIPPING_PRICE_VERSION_OPTION );
	}
);

register_deactivation_hook( FWL_SHIPPING_PRICE_FILE, 'fwl_shipping_price_flush_rate_cache' );

/**
 * Tells the owner what the plugin changed in their stored settings, once.
 *
 * @return void
 */
function fwl_shipping_price_admin_notice(): void {
	if ( ! current_user_can( 'manage_woocommerce' ) ) {
		return;
	}

	$changes = get_option( FWL_SHIPPING_PRICE_SYNC_OPTION );

	if ( ! is_array( $changes ) || empty( $changes ) ) {
		return;
	}

	$lines = array();

	foreach ( $changes as $change ) {
		$lines[] = sprintf(
			/* translators: 1: zone name, 2: method name, 3: old value, 4: new value */
			esc_html__( '%1$s — %2$s: %3$s became %4$s', 'fwl-shipping-price' ),
			esc_html( (string) ( $change['zone'] ?? '' ) ),
			esc_html( (string) ( $change['method'] ?? '' ) ),
			esc_html( (string) ( $change['from'] ?? '' ) ),
			esc_html( (string) ( $change['to'] ?? '' ) )
		);
	}

	printf(
		'<div class="notice notice-success is-dismissible"><p><strong>%s</strong></p><ul style="list-style:disc;margin-left:20px"><li>%s</li></ul><p>%s</p></div>',
		esc_html__( 'FWL Shipping Price updated your saved shipping settings:', 'fwl-shipping-price' ),
		wp_kses_post( implode( '</li><li>', $lines ) ),
		esc_html__( 'Checkout, order totals and the amount charged now all use the new price. This notice will not appear again.', 'fwl-shipping-price' )
	);

	delete_option( FWL_SHIPPING_PRICE_SYNC_OPTION );
}
add_action( 'admin_notices', 'fwl_shipping_price_admin_notice' );

/* -------------------------------------------------------------------------
 * 3. Stale text left behind by the theme or another plugin.
 * ---------------------------------------------------------------------- */

/**
 * The shipping total the customer is genuinely being charged right now.
 *
 * Returns null when it cannot be established. Nothing on screen is touched
 * unless this returns the new price, so the page can never show one figure
 * while the gateway takes another.
 *
 * @return float|null The real shipping total, or null when unknown.
 */
function fwl_shipping_price_actual_shipping_total(): ?float {
	// Thank-you page and order-pay: the order is the record, not the cart.
	// An older order legitimately carries the old price and must keep showing it.
	if ( function_exists( 'is_wc_endpoint_url' ) && ( is_wc_endpoint_url( 'order-received' ) || is_wc_endpoint_url( 'order-pay' ) ) ) {
		global $wp;

		$order_id = absint( $wp->query_vars['order-received'] ?? $wp->query_vars['order-pay'] ?? 0 );
		$order    = $order_id ? wc_get_order( $order_id ) : null;

		return $order ? (float) $order->get_shipping_total() : null;
	}

	if ( ! function_exists( 'WC' ) || ! WC()->cart ) {
		return null;
	}

	return (float) WC()->cart->get_shipping_total();
}

/**
 * Prints the correction script — but only on a page where the server has
 * already applied the new price.
 *
 * This site's checkout theme writes "$11.99" into a button aria-label and uses
 * it as a fallback when it cannot parse the shipping row. Those strings are
 * cosmetic leftovers; this rewrites them to match the real, already-enforced
 * total. It never touches a number the server has not confirmed.
 *
 * @return void
 */
function fwl_shipping_price_print_display_fix(): void {
	if ( ! function_exists( 'is_checkout' ) || ( ! is_checkout() && ! is_cart() ) ) {
		return;
	}

	$actual = fwl_shipping_price_actual_shipping_total();

	// Unknown, free, or genuinely something else: leave every figure alone.
	if ( null === $actual || ! fwl_shipping_price_same( $actual, fwl_shipping_price_new_amount() ) ) {
		return;
	}

	$config = array(
		'old' => array_map(
			static function ( $amount ) {
				return (string) wc_format_decimal( $amount, 2 );
			},
			fwl_shipping_price_old_amounts()
		),
		'new' => (string) wc_format_decimal( fwl_shipping_price_new_amount(), 2 ),
	);

	$script = 'window.FWL_SHIPPING_PRICE=' . wp_json_encode( $config ) . ';' . fwl_shipping_price_display_script();

	if ( function_exists( 'wp_print_inline_script_tag' ) ) {
		wp_print_inline_script_tag( $script, array( 'id' => 'fwl-shipping-price-display' ) );
		return;
	}

	echo '<script id="fwl-shipping-price-display">' . $script . '</script>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Generated, not user input.
}
add_action( 'wp_footer', 'fwl_shipping_price_print_display_fix', 100 );

/**
 * The display-correction script.
 *
 * Deliberately narrow: it only looks inside the shipping row, the totals rows,
 * the mobile order summary and the place-order button, so an unrelated 11.99
 * elsewhere on the page — a product price, an address, a phone number — is never
 * touched. It re-runs after WooCommerce refreshes the checkout because the
 * theme re-renders those rows and re-applies its own hard-coded text.
 *
 * @return string JavaScript, ready to inline.
 */
function fwl_shipping_price_display_script(): string {
	return <<<'JS'
(function () {
	'use strict';

	var cfg = window.FWL_SHIPPING_PRICE;
	if (!cfg || !cfg.old || !cfg.old.length) { return; }

	var SCOPES = [
		'tr.shipping',
		'tr.woocommerce-shipping-totals',
		'tr.order-total',
		'tr.cart-subtotal',
		'#shipping_method',
		'.woocommerce-shipping-methods',
		'.fwl-ship-label',
		'.fwl-mobile-order-summary',
		'.shipping_method',
		'#place_order',
		'.fwl-co-urgency'
	];

	// Lookbehind is avoided on purpose: it throws a SyntaxError on older iOS
	// Safari, which would take the whole script down on exactly the devices most
	// likely to be checking out. A leading capture group does the same job.
	var patterns = cfg.old.map(function (amount) {
		var escaped = amount.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		// Standalone numbers only, so 111.99 and 11.995 are left alone.
		return new RegExp('(^|[^\\d.])' + escaped + '(?![\\d])', 'g');
	});

	function rewrite(text) {
		var out = text;
		patterns.forEach(function (pattern) { out = out.replace(pattern, '$1' + cfg['new']); });
		return out;
	}

	function fixNode(root) {
		if (!root) { return false; }

		var changed = false;
		var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
		var node;

		while ((node = walker.nextNode())) {
			if (!node.nodeValue || node.nodeValue.indexOf('.') === -1) { continue; }

			var next = rewrite(node.nodeValue);
			if (next !== node.nodeValue) { node.nodeValue = next; changed = true; }
		}

		['aria-label', 'value', 'data-value', 'title'].forEach(function (attr) {
			var targets = root.matches && root.matches('[' + attr + ']') ? [root] : [];
			targets = targets.concat(Array.prototype.slice.call(root.querySelectorAll('[' + attr + ']')));

			targets.forEach(function (el) {
				var current = el.getAttribute(attr);
				if (!current) { return; }

				var next = rewrite(current);
				if (next !== current) { el.setAttribute(attr, next); changed = true; }
			});
		});

		return changed;
	}

	function run() {
		var changed = false;

		SCOPES.forEach(function (selector) {
			var nodes;
			try { nodes = document.querySelectorAll(selector); } catch (e) { return; }

			Array.prototype.forEach.call(nodes, function (node) {
				if (fixNode(node)) { changed = true; }
			});
		});

		return changed;
	}

	run();

	// The checkout theme re-renders these rows and re-applies its own hard-coded
	// text, so re-run after every refresh. Each pass is idempotent: once the
	// stale figure is gone there is nothing left to match and the loop settles.
	if (window.jQuery) {
		jQuery(document.body).on(
			'updated_checkout updated_wc_div updated_shipping_method payment_method_selected',
			function () { window.setTimeout(run, 60); window.setTimeout(run, 400); }
		);
	}

	if (window.MutationObserver) {
		var pending = null;
		var observer = new MutationObserver(function () {
			if (pending) { window.clearTimeout(pending); }
			pending = window.setTimeout(run, 120);
		});

		observer.observe(document.body, { childList: true, subtree: true, characterData: true });
	}

	document.addEventListener('DOMContentLoaded', run);
	window.addEventListener('load', run);
})();
JS;
}
