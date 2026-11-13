# Kedicik 🐱

A tiny ginger kitten that lives in a little room on your desktop.

Kedicik ("little cat" in Turkish) is a small desktop widget: a cozy painted room
with a kitten that wanders around, plays, eats, naps in its bed and reacts when
you pet it. It sits on your desktop like a widget, behind your other windows,
and stays out of your way.

> The app's interface (menus and the cat's speech bubbles) is in Turkish.
> English labels are given in brackets below.

## What it does

- **Lives in its room.** The kitten wanders across the floor and into the depth
  of the room, getting smaller as it walks towards the back wall.
- **Day, evening and night.** The room follows your clock: daylight, a warm
  sunset, then a moonlit night.
- **Petting.** Move your mouse back and forth over the kitten. It turns to look
  at you, purrs, and hearts float up. Sometimes it says something sweet.
- **Click the kitten.** It looks at you and meows (or hops).
- **Click the room** to open the side menu:
  - 🧶 **Yarn.** A ball of yarn drops in; the kitten chases and bats it.
    You can click the yarn to throw it too.
  - 🐟 **Food.** A bowl appears and the kitten goes to eat.
  - 🔴 **Laser.** For 15 seconds, move your mouse inside the room and the
    kitten chases the dot. Click the room or press `Esc` to stop early.
  - 🌙 **Sleep / wake.** The kitten walks to its bed in the back corner and
    curls up.
  - ⚙️ **Settings.** Change the size: *Küçük* (small), *Normal*, *Büyük*
    (large), *Dev* (huge).
- **Drag** the room anywhere on your screen. Its position is remembered.
- **It has needs.** It gets hungry over time ("acıktı 🐟" = "I'm hungry") and
  may fall asleep on its own late at night. Its state is saved when you quit.

### Tray / menu bar icon

Kedicik has no Dock or taskbar entry. Instead, a small cat icon appears in the
**menu bar (macOS)** or the **system tray (Windows)**. Its menu has:

| Menu item | Meaning |
|---|---|
| Kediyi göster / gizle | Show / hide the kitten |
| Köşeye getir | Move it back to the screen corner |
| Her zaman üstte | Always on top of other windows (off by default) |
| Boyut | Size |
| Bilgisayar açılınca başlat | Start when the computer starts |
| Çıkış | Quit |

## Install

Kedicik is not signed with an Apple or Microsoft developer certificate, so your
system will warn you the first time you open it. The steps below show how to
open it anyway.

### macOS (Apple Silicon: M1, M2, M3, M4…)

1. Get the `.dmg` file (see [Getting a build](#getting-a-build)).
2. Open it and drag **Kedicik** into **Applications**.
3. Open Kedicik from Applications.
   - If macOS says it **"cannot be verified"**: open
     **System Settings → Privacy & Security**, scroll down and click
     **Open Anyway**, then confirm.
   - If macOS says the app **"is damaged and can't be opened"**: this is
     the same warning in a different form. Open **Terminal** and run:
     ```bash
     xattr -cr /Applications/Kedicik.app
     ```
     Then open Kedicik again.
4. The cat icon appears in the menu bar (top right of the screen) and the
   kitten's room appears in the bottom-right corner of your screen.

> Intel Macs are not part of the default build. To build for an Intel Mac,
> change `"arch": ["arm64"]` to `["x64"]` (or `["universal"]`) in
> `package.json` and build it yourself.

### Windows

1. Get `Kedicik x.y.z.exe` (see [Getting a build](#getting-a-build)). It is a
   portable app: there is no installer, the `.exe` *is* the app.
2. Put the `.exe` somewhere permanent, for example
   `C:\Users\<you>\Apps\Kedicik\`. Don't run it from your Downloads folder
   if you plan to clean that folder up: the start-at-login entry points to
   wherever the file is.
3. Double-click it. If Windows SmartScreen says **"Windows protected your
   PC"**, click **More info → Run anyway**.
4. The cat icon appears in the system tray (bottom right, you may need to
   click the **^** arrow to see it).

## Start automatically when the computer starts

You probably want the kitten waiting for you every time you turn on your
computer. There are two ways to set this up.

### The easy way (from the app)

1. Click the cat icon in the menu bar (macOS) or system tray (Windows).
2. Make sure **Bilgisayar açılınca başlat** (Start when the computer starts)
   has a check mark. Click it to turn it on or off.

When you open the app for the first time, this option is turned **on**
automatically.

### Doing it manually

If the menu option doesn't stick on your system, add it by hand.

**macOS**

1. Open **System Settings → General → Login Items**
   (on older macOS: **System Preferences → Users & Groups → Login Items**).
2. Under **Open at Login**, click **+**.
3. Choose **Kedicik** in your **Applications** folder and click **Open**.

To stop it, select Kedicik in that list and click **−**.

**Windows**

1. Press **Win + R**, type `shell:startup` and press **Enter**.
   A folder called *Startup* opens.
2. In another window, right-click `Kedicik x.y.z.exe` and choose
   **Show more options → Create shortcut** (Windows 11) or
   **Create shortcut** (Windows 10).
3. Move that shortcut into the *Startup* folder.

To stop it, delete the shortcut from the *Startup* folder. You can also turn
startup apps on and off in **Settings → Apps → Startup** or in **Task
Manager → Startup apps**.

## Getting a build

### Option 1: Build with GitHub Actions (macOS, no Mac needed)

1. Fork or clone this repository to your own GitHub account.
2. Go to **Actions → "Mac için derle"** (Build for Mac) → **Run workflow**.
3. When it finishes, download **Kedicik-mac** from the bottom of the run page.
   It contains the `.dmg`.

### Option 2: Build on your own computer

You need [Node.js](https://nodejs.org/) 22 or newer.

```bash
git clone https://github.com/mesuttekgoz0/desktop_cat.git
cd desktop_cat
npm install

npm start            # run it right away, without building
npm run dist:mac     # macOS: creates dist/Kedicik-<version>-arm64.dmg (run this on a Mac)
npm run dist:win     # Windows: creates dist/Kedicik <version>.exe (portable)
```

## Personalize

Edit `src/ayarlar.js`:

- `isim`: the kitten's name, shown in its speech bubbles.
- `mesajlar`: the little notes it says while you pet it. Keep them short
  (about 25 characters).
- `ozelGunler`: special days in `'DD-MM'` format. On that day the kitten
  greets you with your message.

## How it works (for developers)

```
main.js                 Electron main process: window, tray menu, size, start at login
preload.js              Bridge between the page and the main process
src/index.html          The room
src/cat.js              Behaviour: walking with depth, turning, play, food, laser, sleep, petting
src/kedi/rig.js         The animated kitten (see below)
src/kedi/kedi-veri.js   Kitten image + mesh data (generated)
src/kedi/donus-veri.js  Turn frames: back, back-3/4, front (generated)
src/kedi/sahne-veri.js  Room backgrounds and props (generated)
tools/                  Scripts that generate the *-veri.js files from art/
art/                    Source artwork (not shipped in the app)
```

- **The kitten** is a single painting. `src/kedi/rig.js` splits it into a mesh
  of small triangles and binds it to a skeleton: four legs, head, a
  three-joint tail, two ears, eyelids and body. Walking, breathing, blinking,
  eating, batting, grooming and sleeping are all done by bending that mesh
  (WebGL).
- **Turning around and looking at you** use separate painted frames (back,
  back-3/4 and front views) cut from `art/kedi-donus-sayfasi.png`.
- **The room** (`art/arka-plan-gunduz.png`) and the **bed, bowl and yarn**
  (`art/esyalar.png`) are painted in the same style. The evening and night
  rooms are derived from the daytime painting.
- **Depth:** the kitten moves on the floor in two axes. Its feet line and
  scale follow the room's perspective, measured from the background.
- **Battery friendly:** the animation runs at 60 fps only while something is
  moving, 30 fps when idle and 15 fps while the kitten sleeps.

### Regenerating the art

If you replace a painting in `art/`, regenerate the data files (needs Python
with `pillow`, `numpy` and `opencv-python`):

```bash
python tools/make_turn_sprites.py   # art/kedi-donus-sayfasi.png  -> src/kedi/donus-veri.js
python tools/make_scene.py          # art/arka-plan-gunduz.png, art/esyalar.png -> src/kedi/sahne-veri.js
```

If you replace the kitten painting itself, the anatomy coordinates in
`src/kedi/rig.js` (legs, head, tail, eyes) must be updated to match.

## License

MIT
