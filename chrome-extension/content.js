(() => {
  'use strict';

  const BATCH_SIZE = 25;
  const WAIT_AFTER_REFRESH_MS = 30_000;
  const MENU_OPEN_DELAY_MS = 700;
  const BETWEEN_ACTIONS_MS = 1_200;
  const SCROLL_DURATION_MS = 8_000;
  const STATE_KEY = 'facebookBulkUnfollowState';
  const PANEL_ID = 'facebook-bulk-unfollow-extension-panel';

  const defaultState = {
    active: false,
    totalUnfollowed: 0,
    batches: 0,
    message: 'Open your Facebook Following page to start.'
  };

  let isRunning = false;
  let resumeTimer = null;
  let countdownTimer = null;
  let wasOnFollowingPage = false;
  let lastUrl = location.href;

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const isFollowingPage = () => /\/(?:following|friends_following)(?:[/?#]|$)/.test(location.pathname + location.search);

  async function getState() {
    const stored = await chrome.storage.local.get(STATE_KEY);
    return { ...defaultState, ...(stored[STATE_KEY] || {}) };
  }

  async function saveState(patch) {
    const state = { ...(await getState()), ...patch };
    await chrome.storage.local.set({ [STATE_KEY]: state });
    renderPanel(state);
    return state;
  }

  function isVisible(element) {
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
  }

  function getFollowingMenuButtons() {
    const candidates = Array.from(document.querySelectorAll('[aria-label][role="button"]'))
      .filter(button => {
        const label = button.getAttribute('aria-label') || '';
        return isVisible(button) && /actions for|more options|thao tác|tùy chọn/i.test(label);
      });

    // Facebook varies this aria-label by UI experiment and account language. Prefer the
    // per-profile label when it is present; otherwise use the visible "More options" dots.
    const profileActions = candidates.filter(button => /^(actions for|thao tác dành cho|tùy chọn cho)\b/i.test(button.getAttribute('aria-label') || ''));
    if (profileActions.length > 0) return profileActions;

    // The generic fallback must be constrained to the cards below the selected Following
    // tab. This excludes the profile-header and Friends toolbar three-dot buttons.
    const followingTab = Array.from(document.querySelectorAll('[role="tab"], a, [role="link"]'))
      .find(element => isVisible(element) && /^(following|đang theo dõi)$/i.test((element.innerText || '').trim()));
    if (!followingTab) return [];

    const followingTabBottom = followingTab.getBoundingClientRect().bottom;
    return candidates.filter(button => button.getBoundingClientRect().top > followingTabBottom + 12);
  }

  function findUnfollowMenuItem() {
    return Array.from(document.querySelectorAll('[role="menuitem"]'))
      .filter(isVisible)
      .find(item => /\bunfollow\b|bỏ theo dõi/i.test(item.innerText || ''));
  }

  async function scrollToLoadProfiles() {
    const deadline = Date.now() + SCROLL_DURATION_MS;
    while (Date.now() < deadline) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      await sleep(900);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await sleep(1_000);
  }

  function closeMenu() {
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  async function runBatch() {
    const initialState = await getState();
    if (isRunning || !initialState.active || !isFollowingPage()) return;
    isRunning = true;
    await saveState({ message: 'Loading profiles for the next batch…' });

    try {
      await scrollToLoadProfiles();
      const menuButtons = getFollowingMenuButtons();
      if (menuButtons.length === 0) {
        await saveState({ active: false, message: 'Stopped: no Following entries were found.' });
        return;
      }

      let unfollowed = 0;
      let menusWithoutUnfollow = 0;
      for (const menuButton of menuButtons) {
        const state = await getState();
        if (!state.active || unfollowed >= BATCH_SIZE) break;

        try {
          menuButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(450);
          menuButton.click();
          await sleep(MENU_OPEN_DELAY_MS);

          const unfollowItem = findUnfollowMenuItem();
          if (!unfollowItem) {
            menusWithoutUnfollow += 1;
            closeMenu();
            await sleep(350);
            continue;
          }

          unfollowItem.click();
          unfollowed += 1;
          const latest = await getState();
          await saveState({
            totalUnfollowed: latest.totalUnfollowed + 1,
            message: `Unfollowed ${unfollowed}/${BATCH_SIZE} in this batch…`
          });
          await sleep(BETWEEN_ACTIONS_MS);
        } catch (error) {
          console.warn('[Facebook Bulk Unfollow]', error);
          closeMenu();
        }
      }

      const state = await getState();
      if (!state.active) return;
      if (unfollowed === 0) {
        await saveState({
          active: false,
          message: menusWithoutUnfollow ? 'Stopped: no Unfollow action was found.' : 'Stopped: no Following entries remain.'
        });
        return;
      }

      await saveState({
        batches: state.batches + 1,
        message: `Batch complete (${unfollowed}). Refreshing…`
      });
      await sleep(1_000);
      location.reload();
    } finally {
      isRunning = false;
    }
  }

  function renderPanel(state) {
    // Keep Facebook's non-Following surfaces (especially Messenger) unobstructed. The
    // browser-action popup remains available everywhere for checking state or pausing.
    if (!isFollowingPage()) {
      document.getElementById(PANEL_ID)?.remove();
      return;
    }

    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = PANEL_ID;
      Object.assign(panel.style, {
        position: 'fixed', right: '20px', bottom: '24px', zIndex: 2147483647,
        width: '260px', padding: '12px', color: '#fff', background: '#1c1e21',
        borderRadius: '8px', font: '14px/1.4 system-ui, sans-serif', boxShadow: '0 3px 12px rgba(0,0,0,.35)'
      });
      document.body.appendChild(panel);
    }

    panel.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = 'Bulk Unfollow';
    const stats = document.createElement('div');
    stats.textContent = `Total: ${state.totalUnfollowed} · Batches: ${state.batches}`;
    const status = document.createElement('div');
    status.id = `${PANEL_ID}-status`;
    status.textContent = state.message;
    Object.assign(status.style, { margin: '7px 0', fontSize: '12px', color: '#d9e7ff' });
    const button = document.createElement('button');
    button.textContent = state.active ? 'Pause' : 'Start continuous run';
    Object.assign(button.style, {
      width: '100%', padding: '8px 10px', border: 0, borderRadius: '5px', cursor: 'pointer', color: '#fff',
      background: state.active ? '#c5221f' : '#1877f2', fontWeight: '600'
    });
    button.addEventListener('click', () => state.active ? pause() : start());
    panel.append(title, stats, status, button);
  }

  function clearResumeTimers() {
    if (resumeTimer !== null) clearTimeout(resumeTimer);
    if (countdownTimer !== null) clearInterval(countdownTimer);
    resumeTimer = null;
    countdownTimer = null;
  }

  function renderCountdown(runAt) {
    const seconds = Math.max(0, Math.ceil((runAt - Date.now()) / 1_000));
    const status = document.getElementById(`${PANEL_ID}-status`);
    if (status) status.textContent = `Page refreshed. Next batch begins in ${seconds}s…`;
  }

  async function scheduleResume() {
    const state = await getState();
    if (!state.active || resumeTimer !== null || !isFollowingPage()) return;
    const runAt = Date.now() + WAIT_AFTER_REFRESH_MS;
    await saveState({ message: 'Page refreshed. Next batch begins in 30s…' });
    renderCountdown(runAt);
    countdownTimer = setInterval(() => renderCountdown(runAt), 1_000);
    resumeTimer = setTimeout(() => {
      clearResumeTimers();
      runBatch();
    }, WAIT_AFTER_REFRESH_MS);
  }

  async function start() {
    if (!isFollowingPage()) return;
    clearResumeTimers();
    await saveState({ active: true, message: 'Starting the first batch…' });
    runBatch();
  }

  async function pause() {
    clearResumeTimers();
    await saveState({ active: false, message: 'Paused by you.' });
  }

  async function handleRouteChange() {
    if (!isFollowingPage()) {
      wasOnFollowingPage = false;
      clearResumeTimers();
      renderPanel(await getState());
      return;
    }
    const state = await getState();
    renderPanel(state);
    if (!wasOnFollowingPage) {
      wasOnFollowingPage = true;
      scheduleResume();
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'start') start().then(() => sendResponse({ ok: true }));
    else if (message?.type === 'pause') pause().then(() => sendResponse({ ok: true }));
    else return;
    return true;
  });

  handleRouteChange();
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      handleRouteChange();
    }
  }, 1_000);
})();
