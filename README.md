# 🎯 Emoji Catch

A little arcade game built by **Laylah (age 9)** and her dad. Emojis and cute
hand-drawn characters fall from the top of the screen — tap the ones that match
the target shown up top, earn points, and spend them in the Store to unlock more
characters!

Made to run right in **Safari on an iPad** (or any browser). It's a single
HTML file with no downloads or installs needed.

## How to play

- The top of the screen shows what to **Find** — tap those as they fall for **+10** 🟢
- Tap the **wrong** one and you lose a ❤️ (3 hearts = game over)
- Let a target fall off the bottom and you lose **5 points** 📉
- Reach the score goal to **level up** — things fall faster and you hunt for more
  kinds at once
- Spend points in the **🛒 Store** to unlock cute characters
- See everything you own in **🎒 My Cuties**
- **⏸ Pause** and **🔊 Mute** buttons are on the play screen

Your points and unlocked characters are **saved on the device** automatically —
no account or login needed.

## Run it

It's just one file. Either:

- **Open `index.html`** directly in a browser, or
- Serve the folder and open it on another device on the same WiFi:

  ```bash
  cd laylah-game
  python3 -m http.server 8000
  ```

  Then on the iPad's Safari, go to `http://<your-computer's-ip>:8000`

## The characters

Alongside regular emojis, the game has original characters drawn entirely with
code — including **Blobby**, **Ghosty**, **Crown Jelly**, and the rarest prize
of all, **Puppy Love** 🐶💕, designed by Laylah herself.

## How it's built

- Plain HTML + JavaScript on an HTML5 `<canvas>` — no libraries
- Sounds are generated live with the Web Audio API (no sound files)
- Progress is saved with the browser's `localStorage`

Built together as a learn-to-code project. 💛
