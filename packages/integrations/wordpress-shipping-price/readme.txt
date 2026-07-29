=== FWL Shipping Price ===
Contributors: firstwaterlab
Requires at least: 6.0
Tested up to: 7.0
Requires PHP: 7.4
WC requires at least: 7.0
Stable tag: 1.0.0
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Makes the shipping price 9.99 everywhere it appears, and makes sure 9.99 is the amount actually charged.

== What it does ==

Three layers, in order of authority.

1. **The charge.** Every shipping rate WooCommerce offers is checked before it
   is shown. Any rate still costing 11.99 becomes 9.99, with shipping tax
   recalculated. The order's shipping line is checked a second time as the order
   is created, so the total the payment gateway charges is 9.99. Rates that are
   free, or priced at something other than 11.99, are not touched.

2. **Your saved settings.** On activation the plugin rewrites 11.99 out of the
   shipping-zone method settings themselves, so the admin screens agree with the
   checkout. Cost formulas keep working — only the number changes. Everything it
   changed is listed once in an admin notice.

3. **Leftover text.** This site's checkout theme hard-codes "$11.99" in a couple
   of places (the pay button's accessibility label, and a fallback it uses when
   it cannot read the shipping row). A small script corrects that text — but only
   on a page where the server has already confirmed the real shipping total is
   9.99. If the real total is anything else, the script is not loaded at all and
   the page keeps showing the true figure. The displayed price can never
   disagree with the amount charged.

== Installation ==

1. In WordPress, go to **Plugins → Add New → Upload Plugin**.
2. Choose `fwl-shipping-price.zip` and click **Install Now**, then **Activate**.
3. Look for the confirmation notice listing any saved settings it corrected.
4. Open the checkout in a private window and confirm the shipping line, the
   order total and the pay button all read 9.99.

Cached shipping rates are cleared automatically on activation, so open carts
pick up the new price straight away rather than waiting for the session to
expire.

== Frequently asked questions ==

= I already changed the price in WooCommerce → Shipping. Do I still need this? =

If the checkout already shows 9.99 everywhere, you do not. This plugin exists
because parts of this site print 11.99 from somewhere other than the shipping
settings — a cached rate, or text hard-coded in the checkout theme.

= Will it change orders placed before I installed it? =

No. Existing orders keep the price they were placed at, and the thank-you page
for an older order still shows what that customer actually paid.

= What if I want a different price later? =

Change it in WooCommerce → Shipping as usual. If the old figure lingers
anywhere, add this to your theme's functions.php:

	add_filter( 'fwl_shipping_price_old_amounts', function ( $amounts ) {
		$amounts[] = 9.99; // the price you are retiring
		return $amounts;
	} );
	add_filter( 'fwl_shipping_price_new_amount', function () {
		return 7.99; // the price you want
	} );

== Changelog ==

= 1.0.0 =
* Shipping rates, order shipping lines and saved zone settings all moved from
  11.99 to 9.99.
* Stale hard-coded checkout text corrected, but only when the server has
  confirmed the real total.
* Cached shipping rates cleared on activation.
