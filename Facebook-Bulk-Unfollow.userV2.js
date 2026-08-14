// ==UserScript==
// @name         Facebook Bulk Unfollow — Continuous Batches
// @namespace    https://github.com/naqashafzal/Facebook-Bulk-Unfollow-Script
// @version      5.0.2
// @description  Unfollow the following list in resumable batches, refreshing between batches.
// @author       naqashafzal + contributors
// Run on Facebook itself so the control panel survives Facebook's in-page navigation.
// The script only processes entries on Facebook's /following page.
// @match        https://www.facebook.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Keep this deliberately small: the page is refreshed after every batch.
    const BATCH_SIZE = 25;
    const WAIT_AFTER_REFRESH_MS = 30_000;
    const MENU_OPEN_DELAY_MS = 700;
    const BETWEEN_ACTIONS_MS = 1_200;
    const SCROLL_DURATION_MS = 8_000;
    const STATE_KEY = 'facebook-bulk-unfollow-continuous-state-v1';
    const UI_ID = 'fb-bulk-unfollow-panel';

    let isRunning = false;
    let resumeTimer = null;
    let countdownTimer = null;
    let wasOnFollowingPage = false;

    const sleep = (ms) => new Promise(resolve => window.setTimeout(resolve, ms));
    // Facebook's current URL is /<username>/following. Keep the old path as a fallback.
    const isFollowingPage = () => /\/(?:following|friends_following)(?:[/?#]|$)/.test(window.location.pathname + window.location.search);

    function getState() {
        try {
            return JSON.parse(localStorage.getItem(STATE_KEY)) || {
                active: false,
                totalUnfollowed: 0,
                batches: 0,
                message: 'Ready'
            };
        } catch {
            return { active: false, totalUnfollowed: 0, batches: 0, message: 'Ready' };
        }
    }

    function saveState(patch) {
        const state = { ...getState(), ...patch };
        localStorage.setItem(STATE_KEY, JSON.stringify(state));
        renderPanel();
        return state;
    }

    function isVisible(element) {
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    }

    function getMenuButtons() {
        return Array.from(document.querySelectorAll('[aria-label][role="button"]'))
            .filter(button => {
                const label = button.getAttribute('aria-label') || '';
                // The following-card dots use labels such as "Actions for Vũ Văn Thái".
                // This deliberately excludes generic dots in the profile/Friends navigation.
                return isVisible(button) && /^(actions for|thao tác dành cho|tùy chọn cho)\b/i.test(label);
            });
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
        if (isRunning || !getState().active || !isFollowingPage()) return;
        isRunning = true;
        saveState({ message: 'Loading profiles for the next batch…' });

        try {
            await scrollToLoadProfiles();
            const menuButtons = getMenuButtons();

            if (menuButtons.length === 0) {
                saveState({
                    active: false,
                    message: 'Stopped: no following entries were found on this page.'
                });
                return;
            }

            let unfollowed = 0;
            let menusWithoutUnfollow = 0;

            for (const menuButton of menuButtons) {
                if (!getState().active || unfollowed >= BATCH_SIZE) break;

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
                    saveState({
                        totalUnfollowed: getState().totalUnfollowed + 1,
                        message: `Unfollowed ${unfollowed}/${BATCH_SIZE} in this batch…`
                    });
                    await sleep(BETWEEN_ACTIONS_MS);
                } catch (error) {
                    console.warn('[Bulk Unfollow] Could not process an entry:', error);
                    closeMenu();
                }
            }

            if (!getState().active) return;

            if (unfollowed === 0) {
                saveState({
                    active: false,
                    message: menusWithoutUnfollow > 0
                        ? 'Stopped: no visible Unfollow actions were found. Check Facebook language/UI, then start again.'
                        : 'Stopped: no following entries remain.'
                });
                return;
            }

            const state = saveState({
                batches: getState().batches + 1,
                message: `Batch complete (${unfollowed}). Refreshing for the next batch…`
            });
            console.info(`[Bulk Unfollow] Completed batch ${state.batches}: ${unfollowed} unfollowed.`);
            await sleep(1_000);
            window.location.reload();
        } finally {
            isRunning = false;
        }
    }

    function renderPanel() {
        const state = getState();
        const onFollowingPage = isFollowingPage();
        let panel = document.getElementById(UI_ID);
        if (!panel) {
            panel = document.createElement('section');
            panel.id = UI_ID;
            Object.assign(panel.style, {
                position: 'fixed', top: '20px', right: '20px', zIndex: 2147483647,
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
        status.id = `${UI_ID}-status`;
        status.textContent = onFollowingPage
            ? state.message
            : 'Open your Facebook Following list to start.';
        Object.assign(status.style, { margin: '7px 0', fontSize: '12px', color: '#d9e7ff' });
        const button = document.createElement('button');
        button.textContent = state.active ? 'Pause' : onFollowingPage ? 'Start continuous run' : 'Open Following list first';
        Object.assign(button.style, {
            width: '100%', padding: '8px 10px', border: 0, borderRadius: '5px', cursor: 'pointer',
            color: '#fff', background: state.active ? '#c5221f' : '#1877f2', fontWeight: '600',
            opacity: !state.active && !onFollowingPage ? '.6' : '1'
        });
        button.addEventListener('click', () => {
            if (getState().active) {
                clearResumeTimers();
                saveState({ active: false, message: 'Paused by you.' });
                return;
            }
            if (!isFollowingPage()) return;
            saveState({ active: true, message: 'Starting the first batch…' });
            runBatch();
        });
        panel.append(title, stats, status, button);
    }

    function clearResumeTimers() {
        if (resumeTimer !== null) {
            window.clearTimeout(resumeTimer);
            resumeTimer = null;
        }
        if (countdownTimer !== null) {
            window.clearInterval(countdownTimer);
            countdownTimer = null;
        }
    }

    function renderCountdown(runAt) {
        const remainingSeconds = Math.max(0, Math.ceil((runAt - Date.now()) / 1_000));
        const status = document.getElementById(`${UI_ID}-status`);
        if (status) status.textContent = `Page refreshed. Next batch begins in ${remainingSeconds}s…`;
    }

    function scheduleResume() {
        if (!getState().active || resumeTimer !== null || !isFollowingPage()) return;
        const runAt = Date.now() + WAIT_AFTER_REFRESH_MS;
        saveState({ message: 'Page refreshed. Next batch begins in 30s…' });
        renderCountdown(runAt);
        countdownTimer = window.setInterval(() => renderCountdown(runAt), 1_000);
        resumeTimer = window.setTimeout(() => {
            clearResumeTimers();
            runBatch();
        }, WAIT_AFTER_REFRESH_MS);
    }

    function handleRouteChange() {
        const onFollowingPage = isFollowingPage();
        if (!onFollowingPage) {
            wasOnFollowingPage = false;
            clearResumeTimers();
            renderPanel();
            return;
        }

        renderPanel();
        if (!wasOnFollowingPage) {
            wasOnFollowingPage = true;
            scheduleResume();
        }
    }

    // Facebook is a single-page app. Observe navigation APIs, not DOM changes: observing the
    // whole document also observes this script's own panel updates and can create a render loop.
    const routeChangeEvent = 'fb-bulk-unfollow-route-change';
    for (const method of ['pushState', 'replaceState']) {
        const original = window.history[method];
        window.history[method] = function (...args) {
            const result = original.apply(this, args);
            window.dispatchEvent(new Event(routeChangeEvent));
            return result;
        };
    }

    if (document.body) {
        handleRouteChange();
    } else {
        window.addEventListener('DOMContentLoaded', handleRouteChange, { once: true });
    }
    window.addEventListener('popstate', handleRouteChange);
    window.addEventListener(routeChangeEvent, handleRouteChange);
})();
