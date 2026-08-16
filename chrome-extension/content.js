(() => {
  'use strict';

  const BATCH_SIZE = 25;
  const WAIT_AFTER_REFRESH_MS = 30_000;
  const MENU_OPEN_DELAY_MS = 1_000;
  const BETWEEN_ACTIONS_MS = 1_200;
  const SCROLL_DURATION_MS = 8_000;
  const STATE_KEY = 'facebookBulkUnfollowState';
  const PANEL_ID = 'facebook-bulk-unfollow-extension-panel';

  const defaultState = {
    active: false,
    task: null,
    totalUnfollowed: 0,
    batches: 0,
    staleFollowingBatches: 0,
    totalCancelledRequests: 0,
    cancelBatches: 0,
    totalLeftGroups: 0,
    leaveGroupBatches: 0,
    message: 'Open your Facebook Following page to start.'
  };

  let isRunning = false;
  let resumeTimer = null;
  let countdownTimer = null;
  let wasOnFollowingPage = false;
  let lastUrl = location.href;

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const isFollowingPage = () => /\/(?:following|friends_following)(?:[/?#]|$)/.test(location.pathname + location.search);
  const isFriendRequestsPage = () => /^\/friends\/requests(?:[/?#]|$)/.test(location.pathname + location.search);
  const isJoinedGroupsPage = () => /^\/groups\/joins(?:[/?#]|$)/.test(location.pathname + location.search);

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

    // Every candidate, including an "Actions for …" button, must be below the active
    // Following tab. Previously only the generic fallback was scoped, so a header button
    // elsewhere on the page could be preferred over the cards that actually support Unfollow.
    const followingTab = Array.from(document.querySelectorAll('[role="tab"], a, [role="link"]'))
      .find(element => isVisible(element) && /^(following|đang theo dõi)$/i.test((element.innerText || '').trim()));
    if (!followingTab) return [];

    const followingTabBottom = followingTab.getBoundingClientRect().bottom;
    const cardMenus = candidates.filter(button => button.getBoundingClientRect().top > followingTabBottom + 12);
    const profileActions = cardMenus.filter(button => /^(actions for|thao tác dành cho|tùy chọn cho)\b/i.test(button.getAttribute('aria-label') || ''));
    const selectedMenus = profileActions.length > 0 ? profileActions : cardMenus;

    // querySelectorAll follows DOM order (top-to-bottom), even after the page has scrolled.
    // Sort the actual on-screen geometry so the lowest Following cards are processed first.
    return selectedMenus.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
  }

  function findUnfollowMenuItem() {
    return Array.from(document.querySelectorAll('[role^="menuitem"], [role="option"]'))
      .filter(isVisible)
      .find(item => /\bunfollow\b|bỏ theo dõi/i.test(item.innerText || ''));
  }

  async function waitForUnfollowMenuItem(timeoutMs = 2_000) {
    const deadline = Date.now() + timeoutMs;
    let item = findUnfollowMenuItem();
    while (!item && Date.now() < deadline) {
      await sleep(100);
      item = findUnfollowMenuItem();
    }
    return item;
  }

  function findSentRequestsDialog() {
    return Array.from(document.querySelectorAll('[role="dialog"]'))
      .find(dialog => isVisible(dialog) && /\b(sent requests|lời mời đã gửi)\b/i.test(dialog.innerText || ''));
  }

  async function openSentRequestsDialog() {
    let dialog = findSentRequestsDialog();
    if (dialog) return dialog;

    const sentRequestsControl = Array.from(document.querySelectorAll('a, [role="button"], [role="link"]'))
      .find(element => isVisible(element) && /^(view |see )?sent requests$|^(xem )?lời mời đã gửi$/i.test((element.innerText || '').trim()));
    if (!sentRequestsControl) return null;

    sentRequestsControl.click();
    await sleep(1_000);
    return findSentRequestsDialog();
  }

  function getCancelRequestButtons(dialog) {
    return Array.from(dialog.querySelectorAll('button, [role="button"]'))
      .filter(button => isVisible(button) && /^(cancel request|hủy lời mời)$/i.test((button.innerText || '').trim()));
  }

  function getJoinedGroupButtons() {
    const main = document.querySelector('[role="main"]') || document;
    return Array.from(main.querySelectorAll('button, [role="button"]'))
      .filter(button => isVisible(button) && /^(joined|đã tham gia)$/i.test((button.innerText || '').trim()));
  }

  function findLeaveGroupAction() {
    return Array.from(document.querySelectorAll('[role="menuitem"], button, [role="button"]'))
      .find(button => isVisible(button) && /^(leave group|rời khỏi nhóm)$/i.test((button.innerText || '').trim()));
  }

  async function leaveGroupFromButton(joinedButton) {
    joinedButton.click();
    await sleep(MENU_OPEN_DELAY_MS);
    const leaveAction = findLeaveGroupAction();
    if (!leaveAction) {
      await closeMenu(joinedButton);
      return false;
    }

    leaveAction.click();
    await sleep(500);

    // Some Facebook variants ask for a confirmation in a dialog. Confirm only an exact
    // Leave group / Rời khỏi nhóm action inside that dialog.
    const dialog = Array.from(document.querySelectorAll('[role="dialog"]')).find(isVisible);
    const confirmButton = dialog && Array.from(dialog.querySelectorAll('button, [role="button"]'))
      .find(button => isVisible(button) && /^(leave group|rời khỏi nhóm)$/i.test((button.innerText || '').trim()));
    if (confirmButton) {
      confirmButton.click();
      await sleep(500);
    }
    return true;
  }

  function findSponsoredHeading() {
    return Array.from(document.querySelectorAll('[role="heading"], h2, h3, span'))
      .find(element => isVisible(element) && /^(sponsored|được tài trợ)$/i.test((element.innerText || '').trim()));
  }

  function placePanel(panel) {
    const sponsoredHeading = findSponsoredHeading();
    if (sponsoredHeading) {
      Object.assign(panel.style, {
        position: 'relative', top: 'auto', right: 'auto', bottom: 'auto', left: 'auto',
        width: 'auto', margin: '12px 0', zIndex: 'auto'
      });
      sponsoredHeading.insertAdjacentElement('afterend', panel);
      return;
    }

    // Facebook may render the right rail after the main content. Keep a non-blocking fallback
    // until the Sponsored section exists; the next panel render moves it into that section.
    Object.assign(panel.style, {
      position: 'fixed', right: '20px', bottom: '24px', left: 'auto', top: 'auto',
      width: '260px', margin: '0', zIndex: 2147483647
    });
    if (!panel.parentElement) document.body.appendChild(panel);
  }

  async function scrollToLoadProfiles({ returnToTop = true } = {}) {
    const deadline = Date.now() + SCROLL_DURATION_MS;
    while (Date.now() < deadline) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      await sleep(900);
    }
    if (returnToTop) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      await sleep(1_000);
    } else {
      await sleep(700);
    }
  }

  async function closeMenu(menuButton) {
    // Toggle the exact trigger first. A synthetic click on document.body is not always
    // handled by Facebook's React menu, which previously left unrelated menus open.
    if (menuButton?.isConnected && isVisible(menuButton)) menuButton.click();
    await sleep(120);

    if (!Array.from(document.querySelectorAll('[role^="menuitem"], [role="option"]')).some(isVisible)) return;

    // Escape is the standard fallback for Facebook menus when the source button moved.
    for (const type of ['keydown', 'keyup']) {
      document.dispatchEvent(new KeyboardEvent(type, { key: 'Escape', code: 'Escape', bubbles: true }));
    }
    await sleep(80);
    if (Array.from(document.querySelectorAll('[role^="menuitem"], [role="option"]')).some(isVisible)) document.body.click();
  }

  async function runBatch() {
    const initialState = await getState();
    if (isRunning || !initialState.active || (initialState.task && initialState.task !== 'unfollow') || !isFollowingPage()) return;
    isRunning = true;
    await saveState({ message: 'Loading the bottom of Following for the next batch…' });

    try {
      // Already-unfollowed cards may linger at the top of Facebook's list. Keep the page
      // at the bottom after loading so the current batch begins with the unprocessed end.
      await scrollToLoadProfiles({ returnToTop: false });
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

          const unfollowItem = await waitForUnfollowMenuItem();
          if (!unfollowItem) {
            menusWithoutUnfollow += 1;
            await closeMenu(menuButton);
            await sleep(250);
            continue;
          }

          unfollowItem.click();
          unfollowed += 1;
          const latest = await getState();
          await saveState({
            totalUnfollowed: latest.totalUnfollowed + 1,
            staleFollowingBatches: 0,
            message: `Unfollowed ${unfollowed}/${BATCH_SIZE} in this batch…`
          });
          await sleep(BETWEEN_ACTIONS_MS);
        } catch (error) {
          console.warn('[Facebook Bulk Unfollow]', error);
          await closeMenu(menuButton);
        }
      }

      const state = await getState();
      if (!state.active) return;
      if (unfollowed === 0) {
        const staleBatches = state.staleFollowingBatches + 1;
        if (menusWithoutUnfollow > 0) {
          await saveState({
            staleFollowingBatches: staleBatches,
            message: `Skipped ${menusWithoutUnfollow} already-unfollowed cards. Continuing with a refreshed bottom scan (stale batch ${staleBatches})…`
          });
          await sleep(1_000);
          location.reload();
          return;
        }
        await saveState({
          active: false,
          task: null,
          message: menusWithoutUnfollow
            ? 'Stopped: no usable Unfollow action was found.'
            : 'Stopped: no Following entries remain.'
        });
        return;
      }

      await saveState({
        batches: state.batches + 1,
        staleFollowingBatches: 0,
        message: `Batch complete (${unfollowed}). Refreshing…`
      });
      await sleep(1_000);
      location.reload();
    } finally {
      isRunning = false;
    }
  }

  async function runCancelRequestsBatch() {
    const initialState = await getState();
    if (isRunning || !initialState.active || initialState.task !== 'cancelRequests' || !isFriendRequestsPage()) return;
    isRunning = true;
    await saveState({ message: 'Opening Sent requests…' });

    try {
      const dialog = await openSentRequestsDialog();
      if (!dialog) {
        await saveState({ active: false, task: null, message: 'Stopped: Sent requests could not be opened.' });
        return;
      }

      let cancelled = 0;
      while (cancelled < BATCH_SIZE) {
        const state = await getState();
        if (!state.active || state.task !== 'cancelRequests') break;

        const cancelButton = getCancelRequestButtons(dialog)[0];
        if (!cancelButton) break;
        cancelButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(300);
        cancelButton.click();
        cancelled += 1;
        const latest = await getState();
        await saveState({
          totalCancelledRequests: latest.totalCancelledRequests + 1,
          message: `Cancelled ${cancelled}/${BATCH_SIZE} sent requests in this batch…`
        });
        await sleep(BETWEEN_ACTIONS_MS);
      }

      const state = await getState();
      if (!state.active || state.task !== 'cancelRequests') return;
      if (cancelled === 0) {
        await saveState({ active: false, task: null, message: 'Stopped: no Cancel request button remains.' });
        return;
      }

      await saveState({
        cancelBatches: state.cancelBatches + 1,
        message: `Cancelled batch complete (${cancelled}). Refreshing…`
      });
      await sleep(1_000);
      location.reload();
    } finally {
      isRunning = false;
    }
  }

  async function runLeaveGroupsBatch() {
    const initialState = await getState();
    if (isRunning || !initialState.active || initialState.task !== 'leaveGroups' || !isJoinedGroupsPage()) return;
    isRunning = true;
    await saveState({ message: 'Loading joined groups for the next batch…' });

    try {
      await scrollToLoadProfiles();
      const joinedButtons = getJoinedGroupButtons();
      if (joinedButtons.length === 0) {
        await saveState({ active: false, task: null, message: 'Stopped: no Joined group cards were found.' });
        return;
      }

      let left = 0;
      for (const joinedButton of joinedButtons) {
        const state = await getState();
        if (!state.active || state.task !== 'leaveGroups' || left >= BATCH_SIZE) break;

        try {
          joinedButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(350);
          if (!await leaveGroupFromButton(joinedButton)) continue;

          left += 1;
          const latest = await getState();
          await saveState({
            totalLeftGroups: latest.totalLeftGroups + 1,
            message: `Left ${left}/${BATCH_SIZE} groups in this batch…`
          });
          await sleep(BETWEEN_ACTIONS_MS);
        } catch (error) {
          console.warn('[Facebook Bulk Unfollow] Could not leave group:', error);
          await closeMenu(joinedButton);
        }
      }

      const state = await getState();
      if (!state.active || state.task !== 'leaveGroups') return;
      if (left === 0) {
        await saveState({ active: false, task: null, message: 'Stopped: no Leave group action was found.' });
        return;
      }

      await saveState({
        leaveGroupBatches: state.leaveGroupBatches + 1,
        message: `Left group batch complete (${left}). Refreshing…`
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
        padding: '12px', color: '#fff', background: '#1c1e21',
        borderRadius: '8px', font: '14px/1.4 system-ui, sans-serif', boxShadow: '0 3px 12px rgba(0,0,0,.35)'
      });
    }
    placePanel(panel);

    panel.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = 'Bulk Unfollow';
    const stats = document.createElement('div');
    stats.textContent = `Unfollowed: ${state.totalUnfollowed} · Cancelled: ${state.totalCancelledRequests} · Groups left: ${state.totalLeftGroups}`;
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
    const task = state.task || 'unfollow';
    const isCurrentTaskPage = task === 'unfollow'
      ? isFollowingPage()
      : task === 'cancelRequests'
        ? isFriendRequestsPage()
        : isJoinedGroupsPage();
    if (!state.active || resumeTimer !== null || !isCurrentTaskPage) return;
    const runAt = Date.now() + WAIT_AFTER_REFRESH_MS;
    await saveState({ message: 'Page refreshed. Next batch begins in 30s…' });
    renderCountdown(runAt);
    countdownTimer = setInterval(() => renderCountdown(runAt), 1_000);
    resumeTimer = setTimeout(async () => {
      clearResumeTimers();
      const latest = await getState();
      if (latest.task === 'cancelRequests') runCancelRequestsBatch();
      else if (latest.task === 'leaveGroups') runLeaveGroupsBatch();
      else runBatch();
    }, WAIT_AFTER_REFRESH_MS);
  }

  async function start() {
    if (!isFollowingPage()) return;
    clearResumeTimers();
    await saveState({ active: true, task: 'unfollow', message: 'Starting the first unfollow batch…' });
    runBatch();
  }

  async function startCancelRequests() {
    if (!isFriendRequestsPage()) return;
    clearResumeTimers();
    await saveState({ active: true, task: 'cancelRequests', message: 'Starting the first request-cancellation batch…' });
    runCancelRequestsBatch();
  }

  async function startLeaveGroups() {
    if (!isJoinedGroupsPage()) return;
    clearResumeTimers();
    await saveState({ active: true, task: 'leaveGroups', message: 'Starting the first leave-group batch…' });
    runLeaveGroupsBatch();
  }

  async function pause() {
    clearResumeTimers();
    await saveState({ active: false, task: null, message: 'Paused by you.' });
  }

  async function handleRouteChange() {
    const state = await getState();
    const task = state.task || 'unfollow';
    const isCurrentTaskPage = task === 'unfollow'
      ? isFollowingPage()
      : task === 'cancelRequests'
        ? isFriendRequestsPage()
        : isJoinedGroupsPage();
    if (!isCurrentTaskPage) {
      wasOnFollowingPage = false;
      clearResumeTimers();
      renderPanel(state);
      return;
    }
    renderPanel(state);
    if (!wasOnFollowingPage) {
      wasOnFollowingPage = true;
      scheduleResume();
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'start') start().then(() => sendResponse({ ok: true }));
    else if (message?.type === 'cancel-sent-requests') startCancelRequests().then(() => sendResponse({ ok: true }));
    else if (message?.type === 'leave-groups') startLeaveGroups().then(() => sendResponse({ ok: true }));
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
