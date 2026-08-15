# Facebook Bulk Unfollow Chrome Extension

## Install locally

1. Disable the old Tampermonkey script so it cannot run alongside the extension.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Select **Load unpacked** and choose this `chrome-extension` folder. If it is already installed, press the extension's reload icon first.
5. Open `https://www.facebook.com/anlvdt/following`, then click the extension icon and select **Start continuous run**.

The extension processes up to 25 Following entries, reloads, displays a 30-second countdown, and resumes after each reload. It only uses three-dot menus below the selected **Following** tab, never the profile-header menu. Use **Pause** in either the popup or the page panel to stop it.

To cancel sent friend requests, open `https://www.facebook.com/friends/requests` and use **Cancel sent requests** in the extension popup. The extension acts only on the `Cancel request` buttons inside the **Sent requests** dialog, up to 25 requests per batch.

To leave groups, open `https://www.facebook.com/groups/joins/` and use **Leave Facebook groups** in the extension popup. The extension opens a group card's `Joined` control and chooses `Leave group`, up to 25 groups per batch.
