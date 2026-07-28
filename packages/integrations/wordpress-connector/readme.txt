=== Nexus Connector ===
Contributors: nexusos
Tags: dashboard, statistics, api
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Lets Nexus OS read the parts of your site you choose. Read-only, off by default.

== Description ==

This plugin is **optional**. Nexus OS already works with any WordPress site
using a standard application password. Installing this plugin adds:

* one screen where you tick exactly what Nexus may read;
* one aggregated endpoint, so Nexus makes a single request rather than nine;
* a record in your own admin of when Nexus last read something, and as whom.

**What it never does**

* It never writes to your site. There is no POST, PUT, PATCH or DELETE route.
* It never shares customer names, email addresses or postal addresses.
* It never shares anything before you tick it. A fresh install shares nothing.
* It never bypasses WordPress roles: ticking a box cannot grant an account more
  than that account could already do.

== Installation ==

1. Upload the `nexus-connector` folder to `/wp-content/plugins/`.
2. Activate it through the Plugins screen.
3. Go to **Settings › Nexus Connector** and tick what you want to share.
4. In Nexus, connect the site with your WordPress username and an application
   password (Users › Profile › Application Passwords).

== Frequently Asked Questions ==

= Do I need this plugin? =

No. Nexus reads posts, drafts, comments, media and update counts through the
standard WordPress REST API. This plugin gives you finer control and fewer
requests.

= What happens when I delete it? =

Every setting it created is removed from the database, and Nexus falls back to
the standard API automatically.

= Does it store my Nexus credentials? =

No. It stores no credentials at all. Authentication is WordPress's own
application password system.

== Changelog ==

= 0.1.0 =
* First release. Read-only endpoints, per-scope consent, uninstall cleanup.
