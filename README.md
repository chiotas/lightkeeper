# Lightkeeper

A calm Home screen for LG TVs on older webOS, made to sit beside [GlassHouse](https://github.com/rorygallagher2024/glasshouse).

It shows the time, the weather for one city and a short row of your apps and inputs over a picture, and keeps LG's ads and suggestions out. The Home key opens it, it comes up when the TV switches on, and you set it up from your phone.

![Lightkeeper on the TV](docs/screenshots/home-icons.jpg)

**Quick start**, on a rooted LG TV with the Homebrew Channel and GlassHouse:

1. In the Homebrew Channel, open the gear, choose *Add repository* and enter `https://github.com/chiotas/lightkeeper/releases/latest/download/apps.json`.
2. Find Lightkeeper in the channel's list and install it.
3. Open Lightkeeper once from the TV's apps. Then set it up from your phone at `http://<your-tv>:8090`.

**What's new:** 1.0.10 renews the key's status by itself, so a GlassHouse installed after Lightkeeper no longer leaves the settings saying *pending* over a key that works, and the table below holds two more older TVs tried on real hardware. 1.0.9 lets the Magic Remote's pointer slide a long row, lets you choose the tile selected at start and hide the settings gear, and no longer opens Lightkeeper by itself after an update. 1.0.8 takes as many pictures of your own as the TV has room for, can pick one at random each time the TV turns on, and comes straight back from apps that close on Back. 1.0.7 lines the clock styles from 1.0.6 up with the weather, lets you pick any tile's icon, and adds a button, off until you turn it on, that closes the apps left open. 1.0.6 brings updates from the settings, web pages as tiles, and a choice of clock styles and sizes. 1.0.5 adds white logos for 91 more streaming services, from arte to ZDF, and GlassHouse's mark. 1.0.4 also opens at power on over the app left open when the TV went off, and brings Back from the last app to webOS 3. 1.0.3 adds TV, Media player and *Automatic* to the devices an input can show, and 1.0.2 lets you choose the settings' port. Every change is in the [changelog](CHANGELOG.md).

GlassHouse brings its own Home to webOS 9, 10 and 11. Lightkeeper is for the TVs before those, and it started on an LG C1 running webOS 6.5.3.

*[Italiano più sotto](#italiano)*

## Screenshots

| Plain names | Settings on a phone |
|---|---|
| ![The Home with plain names](docs/screenshots/home.jpg) | ![The settings page on a phone](docs/screenshots/settings-phone.png) |

![The Home with icons only: logos without names, a line under the selected one](docs/screenshots/home-icons-only.jpg)

![The settings page on a computer, with a live preview of the TV](docs/screenshots/settings.png)

## What you need

- **An LG webOS TV with root and the [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel).** This project does not explain how to root a TV: follow the Homebrew Channel's own guides.
- **[GlassHouse](https://github.com/rorygallagher2024/glasshouse) installed and running** (its dashboard answers on port 8080). Lightkeeper hands the Home key to itself through GlassHouse's remote-key filter. Tested with GlassHouse 0.118.0; see its [documentation](https://rorygallagher2024.github.io/glasshouse/) to install it. Lightkeeper runs without it too, tried on a webOS 3 TV: the Home, the settings and opening at power on all work, and only the remote key cannot change.
- **A phone or computer on the same network as the TV**, for the settings page.
- An internet connection on the TV for the weather. Everything else works offline.

## Install

Pick one of three ways. Updates come the same way, or from *Updates* in the settings from 1.0.6 on, and your settings stay.

1. **From the Homebrew Channel**, the simplest. Add Lightkeeper's repository once: the gear at the top → *Add repository* → `https://github.com/chiotas/lightkeeper/releases/latest/download/apps.json`. Lightkeeper then appears in the channel's list among the other apps: open it and choose *Install*. When a new version is out, the same page shows it and offers *Update*.
2. **From a file or a link.** `https://github.com/chiotas/lightkeeper/releases/latest/download/lightkeeper.ipk` always leads to the newest release. Paste it in the GlassHouse dashboard → **Apps** → *Install app from a URL or file* ([how](https://rorygallagher2024.github.io/glasshouse/dashboard/apps/)), or download it and install it with [webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop) or `ares-install` from LG's webOS CLI.
3. **Over SSH**, from a computer with this repository and root SSH access to the TV. If your TV needs a particular key, set `LIGHTKEEPER_SSH="ssh -i ~/.ssh/your_tv_key"` first.

   ```sh
   ./lightkeeper.sh install 192.168.1.50
   ```

Then **open Lightkeeper once** from the TV's app list (over SSH it opens by itself). On its first start it asks the Homebrew Channel to set up its settings server and its start-up hook. This takes about ten seconds, and nothing asks you anything. From then on the Home key opens Lightkeeper, and so does switching the TV on; you can turn off either in the settings.

## Set it up

Open **http://&lt;your-tv's-address&gt;:8090** on a phone or computer. On the TV, the gear at the end of the row shows that address, and choosing it opens the same page in the TV's browser.

The preview at the top is the Home as the TV draws it, and it changes as you go. Lightkeeper saves each change at once, and the TV shows it within a few seconds.

- **Tiles.** Choose apps and inputs, which keep the names you gave them on the TV, and web pages, by a name and an address, which open in the TV's browser. Put them in order, by dragging them by their handle on a phone or computer or with the arrows, and rename them if you like. Up to fifty: the row slides as you move along it. At start the Home selects the tile you opened last, or the first if you prefer, and the settings gear at the end of the row can be hidden.
- **Names, logos or app icons.** Show the names alone; white logos, with the app's own icon where there is no logo; or every app's own icon from the TV. Any tile can take another logo or icon from Lightkeeper's catalogue: choose its icon in the settings. With logos or icons, the names can show under every tile, under the selected one only, or not at all, which leaves the icons alone with a short line under the selected one. *Two rows*, off until you turn it on, puts the tiles in two rows: move *New row* in the list to choose where the lower one starts. Each row slides by itself. Turned off, the tiles go back to one row in the same order.
- **Your own logo.** A tile's icon grid has *Upload a logo*, for a logo of yours. It must be a PNG with a transparent background and the logo in white, at least 240 pixels on its longer side. The page checks the file and says what is wrong, trims the empty edges and sends the TV a copy at most 240 pixels tall and 2000 wide. The TV keeps it with your settings, in `/var/lib/lightkeeper/logos`. The cross on it takes it away, and the tiles that showed it go back to their own logo.
- **Open apps.** With *Open apps button* on, a button before the gear shows how many apps are open on the TV and lists them, with *Close all* at the end: OK closes one, Back returns to the Home. Lightkeeper, inputs, Live TV and LG's Home stay out of the list. The button is off until you turn it on.
- **Inputs.** Each input shows the device plugged into it: PlayStation 5, Xbox, Nintendo Switch, Apple TV, Chromecast, Fire TV and more, or a plain TV, media player, game console or HDMI icon. *Automatic*, the first choice, guesses it from the tile's name, and Live TV shows a TV.
- **Background.** Pick one of the nineteen backgrounds Lightkeeper carries: a photograph of Godrevy Lighthouse, six sea paintings and charts in the public domain, ten seascapes by Ivan Aivazovsky, and two quiet gradients, night and dawn. Or add pictures of your own, as many as the TV has room for: your phone or computer crops each to 16:9 and resizes it to 1920 or 3840 pixels before sending it, and Lightkeeper keeps 64 MB free on the TV. Or turn on *Random each time the TV turns on*: Lightkeeper then picks one of the pictures you tick when the TV comes on, never the same one twice in a row. The *shade* slider sets how dark the picture is behind the time and the tiles.
- **Clock and weather.** Choose a 24 or 12-hour clock, its style (thin, classic, bold, monospaced, rounded or digital) and size, and search for a city (from [Open-Meteo](https://open-meteo.com/)). Pick °C or °F, or turn the weather off. Put the clock and weather on the left or the right.
- **Screen saver.** Pause LG's screen saver for an hour while you try things out. It comes back by itself, as an OLED should not show a still picture for long.
- **Remote and power.** Pick which key opens Lightkeeper: Home, or another key GlassHouse can change on your remote, such as the coloured keys. With Home, pressing Back in the last app also returns to Lightkeeper. *Open at power on* brings Lightkeeper up when the TV switches on, over an input, LG's Home, or the app that was open when the TV went off, which webOS puts back. An app that comes up with the TV stays: switch on with the Netflix button, or cast from your phone, and you stay there.
- **Address.** The page's port: 8090, unless you choose another or another program on the TV already has it (see *Another port* in [Troubleshooting](#troubleshooting)).
- **PIN.** An optional PIN for the settings page.

On the remote: **← →** to move, **OK** to open, **Back** to leave, **↓** for LG's own Home. With *Two rows*, **↑ ↓** go from one row to the other, and **↓** on the lower row opens LG's Home. With the Magic Remote's pointer, the arrows at the ends of a long row, or the wheel, slide it.

## Remove it

Any of these takes it all away:

- the settings page, **Remove Lightkeeper**;
- `./lightkeeper.sh uninstall 192.168.1.50`;
- deleting the app from the TV's app list. Lightkeeper notices within two minutes and cleans up after itself, as long as the TV stays on that long.

All three give the Home key back to LG's Home, remove the start-up hook and delete the settings.

## How it works

- `app/` is the webOS web app: the Home (`index.html`), the backgrounds it carries in `backgrounds/` (listed, with their credits, in `backgrounds/index.json`), and under `service/` a small node server, the settings page and the start-up hook. It is written in plain ES5 so it runs on the old Chromium and node versions these TVs ship.
- The server listens on port 8090, or the port chosen in the settings (see *Another port* in [Troubleshooting](#troubleshooting)). It answers only the TV itself and private network addresses, and only to an IP address or `localhost` in the Host header. It runs no command you send it: the only programs it starts are `luna-send`, with calls fixed in its code, GlassHouse's `tvwebctl restart`, and, for *Update*, `curl` to read the latest release's manifest and download its package from this project's GitHub releases, then `service/update.sh` to install it once its size and sha256 match the manifest. It checks every setting before saving it, takes only JPEG pictures up to 3840 × 2160 and 12 MB, and accepts writes only with a JSON or JPEG content type, which a web page elsewhere cannot send it.
- What it writes on the TV: `/var/lib/lightkeeper/` (settings and your picture) and a link in `/var/lib/webosbrew/init.d/60-lightkeeper`, pointing into the app. It also adds its own entry to GlassHouse's key map (`/var/lib/tvweb/remotekeys.json` and the `glasshouse.remoteKeys` setting its filter reads), and leaves the keys you set in GlassHouse alone. It touches nothing on the TV's read-only system.
- The log is in `/tmp/lightkeeper.log`.

## Compatibility

Lightkeeper is built and tested on an LG C1. It is written for the older TVs too (plain ES5 for the Chromium and node versions they ship, and the services GlassHouse already uses on them). The C8 and the webOS 2 and 3 rows come from people who run it; the rest is a reasoned guess.

| | TVs | What to expect |
|---|---|---|
| **Tested** | LG OLED C1 (OLED65C11LB), webOS 6.5.3, GlassHouse 0.118.0 | Everything in this README. |
| **Reported working** | LG OLED C8 (OLED55C8LLA), webOS 4.4.3 (firmware 05.50.70), GlassHouse 0.118.0, Lightkeeper 1.0.7 | The install, the settings on port 8090, the tiles (a waipu.tv tile among them), the Home key and opening at power on ([#8](https://github.com/chiotas/lightkeeper/issues/8)). Back from the last app is untried there: the owner set the key to *None*, which turns Back off too. |
| **Reported working** | LG 43UM7300PUA, webOS 4.10.1 (firmware 05.40.80), GlassHouse 0.123.0, Lightkeeper 1.0.9 and 1.0.10 | The install, the settings (on 8091: Hyperion had 8090), the tiles, the Home key and opening at power on, with the key taken over after Lightkeeper was installed first and GlassHouse only afterwards. |
| **Should work** | webOS 4.x to 8.x (LG's 2018–2023 models, up to "webOS 23"), with GlassHouse running | Reported on webOS 4.4.3 (the C8 above); the others not tried. The code checks no webOS version and needs nothing newer than the web and node engines of these TVs (node 0.12 on webOS 4). They have LG's key filters, which GlassHouse uses to hand over the Home key. If GlassHouse's Apps tab offers to change your remote's keys, Lightkeeper can take the Home key. |
| **Partly** | webOS 2.x and 3.x: reported on an LG B7 with webOS 3.9.3, on an LG 65UJ6300-UA with webOS 3.9.3 running with no GlassHouse at all (1.0.9), and on webOS 2.x by people on Reddit | The Home, the settings and opening at power on work. The Home key stays LG's: LG's key filters came with webOS 4, and without them GlassHouse cannot hand over any key. Without GlassHouse the settings say *GlassHouse is not installed* and everything else works as said here. See [The Home key on webOS 2 and 3](#the-home-key-on-webos-2-and-3). Back from the last app comes back to Lightkeeper there too, from 1.0.4: confirmed on the B7 with 1.0.7, leaving Plex and BBC iPlayer ([#3](https://github.com/chiotas/lightkeeper/issues/3#issuecomment-6415702101)). |
| **Should work, with care** | webOS 9 and 10 ("webOS 24" and "25") | Not tried. GlassHouse has its own Home there; turn it off first, as both would claim the Home key. |
| **Partly** | webOS 11 ("webOS 26") | Not tried. GlassHouse changes keys there with LG's own settings, which leave the Home key out, so Lightkeeper cannot take it. The app, the settings and opening at power on should still work. |
| **Not supported** | webOS 1; any TV without root, the Homebrew Channel and GlassHouse | Lightkeeper needs all three, and no one has reported it working on webOS 1. |

**Tried it on another TV?** Please fill in the [Report from your TV](https://github.com/chiotas/lightkeeper/issues/new?template=2-report-from-your-tv.md) form: the model, the webOS version (Settings → General → About this TV) and how it went, good or bad. Reports move TVs up this table.

### The Home key on webOS 2 and 3

These TVs have no key filters for GlassHouse to use, so the Home key stays LG's there, and Lightkeeper's settings say so. Back from the last app still comes back to Lightkeeper from 1.0.4: with no LG Home app to wait for, Lightkeeper watches for the app in front to give way to nothing.

**Quick Access.** A user with a B7 on webOS 3.9.3 found a way round it: they open Lightkeeper by holding down the 1 key, with the TV's own Quick Access, which opens an app from a number key. It works well, they say, once you and your family are used to it ([issue 3](https://github.com/chiotas/lightkeeper/issues/3#issuecomment-6401333450)).

**lginputhook.** [lginputhook](https://github.com/Simon34545/lginputhook) can remap a button instead. In its interface, add a keybind for the button (its ID shows in lginputhook's log when you press it), choose *Execute* and enter:

```sh
luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"io.github.chiotas.lightkeeper"}'
```

On webOS 3.9, people report that lginputhook 1.4.0 sees the buttons and 1.5.x does not ([lginputhook issue 44](https://github.com/Simon34545/lginputhook/issues/44)). On that B7 it did not work: 1.5 logged nothing when keys were pressed, and 1.4 showed the key IDs, but a key remapped to launch Lightkeeper did nothing ([issue 3](https://github.com/chiotas/lightkeeper/issues/3#issuecomment-6401333450)). Mapped this way, the button no longer opens LG's own launcher. If it works on your TV, please tell us.

## Troubleshooting

**The Home key still opens LG's Home.** In the settings, *Remote and power* says what the key is doing. "Active within a minute" means GlassHouse is restarting to put its key filter in place: wait a minute. "GlassHouse is not installed" means Lightkeeper cannot find GlassHouse on the TV: install it first. On webOS 2 and 3 the settings say the key cannot be taken: see [The Home key on webOS 2 and 3](#the-home-key-on-webos-2-and-3). A GlassHouse update can also reset the keys; changing the key in Lightkeeper's settings sets it again.

**The settings page does not open.** Make sure your phone is on the same network as the TV, and type the address with `http://` and the port the gear shows, `:8090` unless you changed it. If it still does not answer, open Lightkeeper once from the TV's app list: it starts its server again if needed. Over SSH, `./lightkeeper.sh install <address>` puts everything back in place and keeps your settings.

**Another port.** If another program on the TV already uses 8090, Lightkeeper takes the next free port, up to 8100, and the gear on the TV shows the address to use. The log says so too. To choose the port yourself, use *Address* in the settings, or, if you cannot open them, run this on the TV over SSH and the settings move to the new port at once:

```sh
sh /media/developer/apps/usr/palm/applications/io.github.chiotas.lightkeeper/service/setup.sh --port 8091
```

The port is also `"port"` in `/var/lib/lightkeeper/config.json`, read at each start.

**Lightkeeper does not come up when the TV switches on.** Check *Open at power on* in the settings. Lightkeeper opens over an input, LG's Home or the app left open when the TV went off, but not over an app that came up with the TV, so switching on with the Netflix button keeps you on Netflix. The log says which it was. After a full restart of the TV, the Homebrew Channel starts Lightkeeper about 40 seconds in.

**Switching on the TV also switches on a console or a streaming box.** That is the TV's own HDMI-CEC, not Lightkeeper: Settings → General → Devices → HDMI Settings → SIMPLINK (HDMI-CEC) → *Auto Power Sync*. Turned off, the console's own button still switches on the TV.

**The screen saver gets in the way while you try things.** *Remote and power* → *Pause for an hour*. It also closes a screen saver already on.

**A tile shows a coloured icon among white logos.** Lightkeeper has no logo for that app, and it could not make the TV's icon white. Choose *Names* or *App icons* instead, or open an issue with the app's name.

**Something else.** The log is in `/tmp/lightkeeper.log` on the TV. Please attach it, with what you did, to an [issue](https://github.com/chiotas/lightkeeper/issues).

## Develop

```sh
./lightkeeper.sh preview    # settings on http://127.0.0.1:8090, the Home on http://127.0.0.1:8091, against a stand-in TV
node test/check.js        # the server's checks
./lightkeeper.sh build      # dist/*.ipk
```

A release carries four files from `dist/`: the package, `io.github.chiotas.lightkeeper_<version>_all.ipk`; the same file as `lightkeeper.ipk`, for the link that leads to the newest release; and the Homebrew Channel's catalog, `apps.json` and `lightkeeper.manifest.json`. The page the channel shows is [docs/homebrew-channel.html](docs/homebrew-channel.html), read from `main`.

```sh
V=1.0.4  # the version in app/appinfo.json
gh release create v$V dist/io.github.chiotas.lightkeeper_${V}_all.ipk dist/lightkeeper.ipk dist/apps.json dist/lightkeeper.manifest.json
```

To try an update without a release, write `{"manifest": "http://<computer>:8000/lightkeeper.manifest.json"}` to `/var/lib/lightkeeper/update-test.json` on the TV: the settings then read that manifest and take the package from beside it. Remove the file afterwards.

A new background is a 1920 × 1080 JPEG in `app/backgrounds/`, a 384 × 216 copy in `app/backgrounds/thumbs/`, and an entry in `app/backgrounds/index.json`.

## Contributing

Ideas, reports and pull requests are welcome.

- **Missing a service or a console?** [Open an issue](https://github.com/chiotas/lightkeeper/issues/new/choose) with its name and, if you know it, a link to the official logo. I'll add the name and a white logo.
- **Tried it on another TV?** The [Report from your TV](https://github.com/chiotas/lightkeeper/issues/new?template=2-report-from-your-tv.md) form takes two minutes and fills in the compatibility table.
- **Pull requests:** keep the code plain ES5, as the older TVs need, and run `node test/check.js` before you send it.

## Credits

- Default background: *Godrevy Lighthouse*, a photograph by [Francesco Gola](https://francescogola.net). © Francesco Gola, all rights reserved; it may be used only as part of Lightkeeper, see [PHOTO-LICENSE.md](PHOTO-LICENSE.md).
- The other backgrounds, cropped to 16:9 from the museums' and the Library of Congress's own images:
  - James McNeill Whistler, *Nocturne: Blue and Gold—Southampton Water*, 1872. Art Institute of Chicago, public domain ([artic.edu](https://www.artic.edu/artworks/56905)).
  - Fitz Henry Lane, *Lumber Schooners at Evening on Penobscot Bay*, 1863. National Gallery of Art, Washington, CC0 ([nga.gov](https://www.nga.gov/artworks/57611-lumber-schooners-evening-penobscot-bay)).
  - Peder Balke, *The North Cape by Moonlight*, 1848. The Metropolitan Museum of Art, CC0 ([metmuseum.org](https://www.metmuseum.org/art/collection/search/441379)).
  - Caspar David Friedrich, *The Monk by the Sea*, 1808–1810. Alte Nationalgalerie, Berlin, public domain ([Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Caspar_David_Friedrich_-_Der_M%C3%B6nch_am_Meer_-_Google_Art_Project.jpg)).
  - James McNeill Whistler, *Nocturne in Black and Gold: Entrance to Southampton Water*, c. 1875–1876. Freer Gallery of Art, Smithsonian, CC0 ([si.edu](https://asia-archive.si.edu/object/F1897.21a-b/)).
  - James Horsburgh, *China Sea, Sheet I*, 1806. Library of Congress, public domain ([loc.gov](https://www.loc.gov/item/84696453/)); shown here in negative.
  - *Night at sea* and *Dawn at sea*: gradients made for Lightkeeper, under its MIT licence.
- Ten seascapes by Ivan Aivazovsky, cropped to 16:9 from Wikimedia Commons, public domain on each file's page:
  - *The Ninth Wave*, 1850. State Russian Museum, Saint Petersburg ([Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Hovhannes_Aivazovsky_-_The_Ninth_Wave_-_Google_Art_Project.jpg)).
  - *The Black Sea*, 1881. State Tretyakov Gallery, Moscow ([Wikimedia Commons](https://commons.wikimedia.org/wiki/File:%D0%98%D0%B2%D0%B0%D0%BD_%D0%9A%D0%BE%D0%BD%D1%81%D1%82%D0%B0%D0%BD%D1%82%D0%B8%D0%BD%D0%BE%D0%B2%D0%B8%D1%87_%D0%90%D0%B9%D0%B2%D0%B0%D0%B7%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9_-_%D0%A7%D0%B5%D1%80%D0%BD%D0%BE%D0%B5_%D0%BC%D0%BE%D1%80%D0%B5_(%D0%BD%D0%B0_%D0%A7%D0%B5%D1%80%D0%BD%D0%BE%D0%BC_%D0%BC%D0%BE%D1%80%D0%B5_%D0%BD%D0%B0%D1%87%D0%B8%D0%BD%D0%B0%D0%B5%D1%82_%D1%80%D0%B0%D0%B7%D1%8B%D0%B3%D1%80%D1%8B%D0%B2%D0%B0%D1%82%D1%8C%D1%81%D1%8F_%D0%B1%D1%83%D1%80%D1%8F)_-_Google_Art_Project.jpg)).
  - *The Wave*, 1889. State Russian Museum, Saint Petersburg; photograph by Евгений Со, who also licenses it CC BY-SA 3.0 ([Wikimedia Commons](https://commons.wikimedia.org/wiki/File:%D0%90%D0%B9%D0%B2%D0%B0%D0%B7%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9_%D0%98.%D0%9A._%D0%92%D0%BE%D0%BB%D0%BD%D0%B0.jpg)).
  - *Among the Waves*, 1898. Image from Sotheby's ([Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Ivan_Konstantinovich_Aivazovsky_-_Among_the_Waves,_1898.jpg)).
  - *The Rainbow*, 1873. State Tretyakov Gallery, Moscow; the only full image is 1539 × 1200, enlarged ([Wikimedia Commons](https://commons.wikimedia.org/wiki/File:%D0%90%D0%B9%D0%B2%D0%B0%D0%B7%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9_(%D0%93%D0%B0%D0%B9%D0%B2%D0%B0%D0%B7%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9)_%D0%98%D0%B2%D0%B0%D0%BD_(%D0%9E%D0%B3%D0%B0%D0%BD%D0%B5%D1%81)_%D0%9A%D0%BE%D0%BD%D1%81%D1%82%D0%B0%D0%BD%D1%82%D0%B8%D0%BD%D0%BE%D0%B2%D0%B8%D1%87_%D0%A0%D0%B0%D0%B4%D1%83%D0%B3%D0%B0.jpg)).
  - *Gathering Storm*, 1899. Image from Sotheby's ([Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Ivan_Konstantinovich_Aivazovsky_-_Gathering_Storm,_1899.jpg)).
  - *The Storm*, 1880. Sakıp Sabancı Museum, Istanbul ([Wikimedia Commons](https://commons.wikimedia.org/wiki/File:%D0%98%D0%B2%D0%B0%D0%BD_%D0%9A._%D0%90%D0%B9%D0%B2%D0%B0%D0%B7%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9_-_%D0%91%D1%83%D1%80%D1%8F_(1880).jpg)).
  - *Seascape with Full Moon*, 1857. Sakıp Sabancı Museum, Istanbul ([Wikimedia Commons](https://commons.wikimedia.org/wiki/File:%D0%98%D0%B2%D0%B0%D0%BD_%D0%9A._%D0%90%D0%B9%D0%B2%D0%B0%D0%B7%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9_-_%D0%9C%D0%BE%D1%80%D1%81%D0%BA%D0%BE%D0%B9_%D0%BF%D0%B5%D0%B9%D0%B7%D0%B0%D0%B6_%D1%81_%D0%BF%D0%BE%D0%BB%D0%BD%D0%BE%D0%B9_%D0%BB%D1%83%D0%BD%D0%BE%D0%B9_(1857).jpg)).
  - *Sunset at Sea*, 1877. Sakıp Sabancı Museum, Istanbul ([Wikimedia Commons](https://commons.wikimedia.org/wiki/File:%D0%98%D0%B2%D0%B0%D0%BD_%D0%9A._%D0%90%D0%B9%D0%B2%D0%B0%D0%B7%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9_-_%D0%97%D0%B0%D0%BA%D0%B0%D1%82_%D0%BD%D0%B0_%D0%BC%D0%BE%D1%80%D0%B5_(1877).jpg)).
  - *Seascape*, undated. Dagestan Museum of Fine Arts, Makhachkala ([Wikimedia Commons](https://commons.wikimedia.org/wiki/File:%D0%98%D0%B2%D0%B0%D0%BD_%D0%9A._%D0%90%D0%B9%D0%B2%D0%B0%D0%B7%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9_-_%D0%9C%D0%BE%D1%80%D1%81%D0%BA%D0%BE%D0%B9_%D0%BF%D0%B5%D0%B9%D0%B7%D0%B0%D0%B6.jpg)).
- Logos: drawings from [Simple Icons](https://simpleicons.org/) 16.35.0 (CC0), and for the brands Simple Icons does not carry, such as Prime Video, Disney+, arte, Canal+, Xbox and Nintendo Switch, the brands' own logos from Wikimedia Commons, where they are in the public domain as simple text and shapes. `docs/art/logos-commons.tsv` lists each file and the licence templates on its page. All are drawn in white for Lightkeeper. The logos and names belong to their owners and are used only to identify apps and devices.
- GlassHouse's mark, for its dashboard's tile: drawn from [GlassHouse](https://github.com/rorygallagher2024/glasshouse)'s own logo, MIT, © 2026 Rory Gallagher (`app/logos/LICENSE-glasshouse.txt`).
- Icons for LG's own apps, game consoles, plain HDMI and the settings gear: [Phosphor Icons](https://phosphoricons.com/) (MIT) and Google's [Material Symbols](https://fonts.google.com/icons) (Apache 2.0); their licences are in `app/logos/`.
- Typeface: [Jost](https://github.com/indestructible-type/Jost), SIL Open Font License 1.1 (`app/OFL.txt`). The fixed 200, 300 and 500 weights, for engines without variable fonts, are instances of the same file.
- The clock's other typefaces, digits only, made by `docs/art/clock-fonts.py`: [Cormorant Garamond](https://github.com/CatharsisFonts/Cormorant), [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono), [Nunito](https://github.com/googlefonts/nunito) and [DSEG7](https://github.com/keshikan/DSEG), all SIL Open Font License 1.1, their licences in `app/clock/`. DSEG's subset is renamed, as its Reserved Font Name asks of modified versions.
- Weather data by [Open-Meteo.com](https://open-meteo.com/), CC BY 4.0.
- [GlassHouse](https://github.com/rorygallagher2024/glasshouse), whose key filter and set-up through the Homebrew Channel Lightkeeper builds on.

## Licence

The code is MIT, © 2026 Francesco Gola: see [LICENSE](LICENSE). The default background photograph is not under the MIT licence: it may be used only as part of Lightkeeper, unmodified. See [PHOTO-LICENSE.md](PHOTO-LICENSE.md).

**Use at your own risk.** Lightkeeper runs as root on a TV that has been modified, and it comes with no warranty. It is not affiliated with or endorsed by LG Electronics. webOS is a trademark of LG Electronics.

---

## Italiano

**Lightkeeper** è una Home calma per le TV LG con webOS vecchi, da usare insieme a [GlassHouse](https://github.com/rorygallagher2024/glasshouse). Mostra l'ora, il meteo di una città e una fila corta di app e ingressi sopra un'immagine, e tiene fuori pubblicità e suggerimenti di LG. Si apre col tasto Home e all'accensione, e si configura dal telefono. GlassHouse ha la sua Home per webOS 9, 10 e 11; Lightkeeper è per le TV di prima ed è nata su una LG C1 con webOS 6.5.3.

**Avvio rapido**, su una TV LG con root, Homebrew Channel e GlassHouse:

1. Nel Homebrew Channel aprite l'ingranaggio, scegliete *Add repository* e inserite `https://github.com/chiotas/lightkeeper/releases/latest/download/apps.json`.
2. Trovate Lightkeeper nella lista del canale e installatela.
3. Apritela una volta dalle app della TV. Poi si configura dal telefono su `http://<tv>:8090`.

**Novità.** La 1.0.9 fa scorrere una fila lunga col puntatore del Magic Remote, lascia scegliere la voce selezionata all'avvio e nascondere l'ingranaggio, e non riapre più Lightkeeper da sola dopo un aggiornamento. La 1.0.8 accetta quante immagini vostre entrano sulla TV, può sceglierne una a caso a ogni accensione e torna subito a Lightkeeper dalle app che si chiudono con Indietro. La 1.0.7 allinea al meteo gli stili d'orologio della 1.0.6, lascia scegliere l'icona di ogni voce e aggiunge un pulsante, spento finché non lo accendete, che chiude le app rimaste aperte. La 1.0.6 porta gli aggiornamenti dalle impostazioni, le tessere che aprono una pagina web e la scelta di stile e dimensione dell'orologio. La 1.0.5 aggiunge i loghi bianchi di altri 91 servizi di streaming, da arte a ZDF, e il marchio di GlassHouse. La 1.0.4 all'accensione si apre anche sopra l'app rimasta aperta allo spegnimento, e porta Indietro dall'ultima app sul webOS 3. La 1.0.3 aggiunge TV, lettore multimediale (*Media player*) e *Automatic* agli apparecchi che un ingresso può mostrare, la 1.0.2 permette di scegliere la porta delle impostazioni, la 1.0.1 ha portato le icone senza nomi e fino a cinquanta voci. Tutte le modifiche sono nel [changelog](CHANGELOG.md).

**Cosa serve.** Una TV LG con root, il **Homebrew Channel** ([webosbrew](https://github.com/webosbrew/webos-homebrew-channel)) e **GlassHouse** ([documentazione](https://rorygallagher2024.github.io/glasshouse/)) già installati: questo progetto non spiega come installarli, seguite le loro guide. Poi un telefono o un computer sulla stessa rete della TV, e internet sulla TV per il meteo.

**Installazione.** Tre modi; gli aggiornamenti passano dallo stesso e le impostazioni restano.

1. **Dal Homebrew Channel**, il più semplice: ingranaggio in alto → *Add repository* → `https://github.com/chiotas/lightkeeper/releases/latest/download/apps.json`. Lightkeeper compare nella lista del canale insieme alle altre app: apritela e scegliete *Install*. Quando esce una versione nuova, la stessa pagina la mostra e offre *Update*.
2. **Da file o indirizzo.** `https://github.com/chiotas/lightkeeper/releases/latest/download/lightkeeper.ipk` porta sempre all'ultima release. Incollatelo in GlassHouse (*Apps* → *Install app from a URL or file*), oppure scaricatelo e installatelo con webOS Dev Manager o `ares-install`.
3. **Via SSH** da un computer, come root: `./lightkeeper.sh install 192.168.1.50`.

Poi aprite Lightkeeper una volta dalle app della TV (via SSH si apre da sola). Al primo avvio chiede al Homebrew Channel di preparare il suo server e l'avvio automatico: una decina di secondi, senza domande. Da qui in poi il tasto Home e l'accensione aprono Lightkeeper; si possono spegnere entrambi dalle impostazioni.

**Impostazioni.** Aprite **http://&lt;indirizzo-della-TV&gt;:8090** dal telefono o dal computer, oppure scegliete l'ingranaggio in fondo alla fila sulla TV, che mostra anche l'indirizzo. L'anteprima in alto è la Home come la disegna la TV e cambia mentre si regola. Ogni modifica si salva subito. Si possono scegliere:

- le voci, cioè app e ingressi coi loro nomi e pagine web con nome e indirizzo, che si aprono nel browser della TV, fino a cinquanta, da riordinare trascinandole o con le frecce e da rinominare; all'avvio la Home seleziona l'ultima voce aperta o la prima, e l'ingranaggio in fondo alla fila si può nascondere;
- solo nomi, loghi bianchi o icone delle app, e per ogni voce un altro logo o icona dal catalogo di Lightkeeper, da scegliere con l'icona accanto alla voce; con loghi e icone, i nomi sotto tutte le voci, solo sotto quella scelta o da nessuna parte (solo icone); due righe (*Two rows*), spente finché non le accendete: *New row* nella lista sceglie dove comincia la riga di sotto, e ogni riga scorre da sola; spegnendole, le voci tornano in una riga nello stesso ordine;
- un logo vostro per una voce, con *Upload a logo* nella griglia delle icone: un PNG con lo sfondo trasparente e il logo bianco, di almeno 240 pixel sul lato lungo. La pagina controlla il file e dice cosa non va, toglie i bordi vuoti e manda alla TV una copia alta al massimo 240 pixel e larga al massimo 2000. La TV lo tiene con le impostazioni, in `/var/lib/lightkeeper/logos`; la crocetta lo toglie e le voci che lo mostravano tornano al loro logo;
- il pulsante delle app aperte (*Open apps button*), spento finché non lo accendete: prima dell'ingranaggio mostra quante app sono aperte sulla TV e le elenca, OK ne chiude una, *Close all* tutte, Indietro torna alla Home;
- per ogni ingresso l'apparecchio collegato, oppure un'icona generica (TV, lettore multimediale, console, HDMI); *Automatic*, la prima scelta, lo indovina dal nome della voce, e Live TV mostra una TV;
- lo sfondo, tra i diciannove che Lightkeeper porta con sé (la foto del faro di Godrevy, sei marine e carte nautiche di pubblico dominio, dieci marine di Ivan Aivazovsky, due sfumature) oppure vostre immagini, quante ne entrano lasciando 64 MB liberi sulla TV, ritagliate e ridimensionate a 1920 o 3840 pixel sul telefono prima dell'invio, o uno a caso a ogni accensione fra quelli spuntati, mai lo stesso due volte di fila (*Random each time the TV turns on*); e l'intensità del velo;
- l'orologio a 24 o 12 ore, il suo stile (sottile, classico, deciso, monospaziato, arrotondato o digitale) e la dimensione, e la città del meteo, cercata su Open-Meteo, in °C o °F; ora e meteo a sinistra o a destra;
- una pausa di un'ora dello screensaver di LG, per fare prove;
- il tasto che apre Lightkeeper (con Home, anche Indietro dall'ultima app torna qui) e l'apertura all'accensione, sopra un ingresso, la Home di LG o l'app rimasta aperta allo spegnimento, ma non sopra un'app partita con la TV (tasto Netflix, cast dal telefono);
- la porta della pagina (*Address*);
- un PIN facoltativo per la pagina.

Sul telecomando: **← →** per scegliere, **OK** per aprire, **Indietro** per uscire, **↓** per la Home di LG. Con due righe, **↑ ↓** passano da una riga all'altra e **↓** sulla riga di sotto apre la Home di LG. Col puntatore del Magic Remote, una fila lunga scorre con le frecce ai lati o con la rotella.

**Disinstallazione.** Dalla pagina (*Remove Lightkeeper*), con `./lightkeeper.sh uninstall 192.168.1.50`, o cancellando l'app dalla TV, che se ne accorge entro due minuti se resta accesa. Il tasto Home torna alla Home di LG, l'avvio automatico sparisce e le impostazioni vengono cancellate.

**Come funziona.** Un'app web per webOS scritta in ES5 e un piccolo server node sulla porta 8090, che risponde solo alla TV e alla rete di casa e non esegue comandi ricevuti. Scrive solo in `/var/lib/lightkeeper/`, un collegamento in `/var/lib/webosbrew/init.d/` e la propria voce nella mappa dei tasti di GlassHouse, senza toccare i tasti impostati lì. Il registro è in `/tmp/lightkeeper.log`.

**Compatibilità.** Provata su LG OLED C1 (OLED65C11LB), webOS 6.5.3, GlassHouse 0.118.0. Su una LG OLED C8 (OLED55C8LLA) con webOS 4.4.3, GlassHouse 0.118.0 e la 1.0.7, chi la usa riferisce che funzionano installazione, impostazioni, voci, tasto Home e apertura all'accensione ([issue 8](https://github.com/chiotas/lightkeeper/issues/8)); Indietro dall'ultima app lì non è provato, perché il proprietario ha messo il tasto su *None*, che spegne anche Indietro. Dovrebbe funzionare sui webOS da 4.x a 8.x con GlassHouse. Sui webOS 2.x e 3.x funziona in parte (segnalazioni da una LG B7 con webOS 3.9.3 e da Reddit): il tasto Home resta di LG, perché lì GlassHouse non può prendere nessun tasto, mentre dalla 1.0.4 Indietro dall'ultima app torna a Lightkeeper (confermato sulla B7 con la 1.0.7, uscendo da Plex e da BBC iPlayer, [issue 3](https://github.com/chiotas/lightkeeper/issues/3#issuecomment-6415702101)); un utente con la B7 apre Lightkeeper tenendo premuto il tasto 1, con l'Accesso rapido (*Quick Access*) della TV, che apre un'app da un tasto numerico. Su quella TV [lginputhook](https://github.com/Simon34545/lginputhook) non ha funzionato: la 1.5 non registra i tasti, la 1.4 li vede ma il lancio non parte ([issue 3](https://github.com/chiotas/lightkeeper/issues/3#issuecomment-6401333450)). I dettagli sono in *The Home key on webOS 2 and 3*. Sui webOS 9 e 10 va spenta prima la Home di GlassHouse; sul webOS 11 il tasto Home resta di LG. Non sono supportati il webOS 1 e le TV senza root, Homebrew Channel e GlassHouse. Se la provate su un'altra TV, compilate il modulo [Report from your TV](https://github.com/chiotas/lightkeeper/issues/new?template=2-report-from-your-tv.md) con modello, versione e com'è andata.

**Problemi.** Se il tasto Home apre ancora la Home LG, nelle impostazioni la sezione *Remote and power* dice cosa sta facendo: «Active within a minute» vuol dire aspettare un minuto; sui webOS 2 e 3 dicono che il tasto non si può prendere (vedi *Compatibilità*). Se la pagina non si apre: stessa rete della TV, indirizzo con `http://` e la porta che mostra l'ingranaggio (`:8090` se non l'avete cambiata), poi aprite Lightkeeper una volta dalla TV. Se un altro programma sulla TV usa già la 8090, Lightkeeper prende la prima porta libera fino alla 8100 e l'ingranaggio mostra l'indirizzo giusto. La porta si sceglie in *Address* nelle impostazioni, oppure via SSH con `sh /media/developer/apps/usr/palm/applications/io.github.chiotas.lightkeeper/service/setup.sh --port 8091`. Se accendendo la TV si accende anche la console, è il SIMPLINK della TV: Impostazioni → Generali → Dispositivi → Impostazioni HDMI → SIMPLINK → *Sincronizzazione accensione automatica*. Il registro è in `/tmp/lightkeeper.log` sulla TV.

**Contribuire.** Suggerimenti, segnalazioni e pull request sono benvenuti. Manca un servizio o una console? [Aprite una segnalazione](https://github.com/chiotas/lightkeeper/issues/new/choose) col nome e, se c'è, il link al logo ufficiale: aggiungo nome e logo bianco. Se la provate su un'altra TV, il modulo [Report from your TV](https://github.com/chiotas/lightkeeper/issues/new?template=2-report-from-your-tv.md) richiede due minuti.

**Licenza.** Il codice è MIT, © 2026 Francesco Gola. La foto dello sfondo predefinito, *Godrevy Lighthouse* di [Francesco Gola](https://francescogola.net), ha una licenza sua ([PHOTO-LICENSE.md](PHOTO-LICENSE.md)): tutti i diritti riservati, si usa solo dentro Lightkeeper e senza modifiche. Gli altri sfondi e i loro crediti sono nella sezione *Credits*. I loghi appartengono ai rispettivi proprietari e sono usati solo per identificare app e apparecchi; i disegni vengono da Simple Icons (CC0) e da Wikimedia Commons (pubblico dominio; file e licenze in `docs/art/logos-commons.tsv`). Il marchio di GlassHouse viene dal suo repository, MIT (`app/logos/LICENSE-glasshouse.txt`). **Uso a proprio rischio**: Lightkeeper gira come root su una TV modificata e non ha alcuna garanzia. Non è affiliata né approvata da LG Electronics.
