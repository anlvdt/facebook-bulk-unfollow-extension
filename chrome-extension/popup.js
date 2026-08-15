const STATE_KEY = 'facebookBulkUnfollowState';

const defaultState = {
  active: false,
  task: null,
  totalUnfollowed: 0,
  batches: 0,
  totalCancelledRequests: 0,
  cancelBatches: 0,
  message: 'Open your Facebook Following page to start.'
};

async function getState() {
  const stored = await chrome.storage.local.get(STATE_KEY);
  return { ...defaultState, ...(stored[STATE_KEY] || {}) };
}

async function getFacebookTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url?.startsWith('https://www.facebook.com/') ? tab : null;
}

async function render() {
  const state = await getState();
  const tab = await getFacebookTab();
  const isFollowing = /\/following(?:[/?#]|$)|\/friends_following(?:[/?#]|$)/.test(tab?.url || '');
  const isRequests = /\/friends\/requests(?:[/?#]|$)/.test(tab?.url || '');
  document.getElementById('stats').textContent = `Unfollowed: ${state.totalUnfollowed} · Cancelled: ${state.totalCancelledRequests}`;
  document.getElementById('status').textContent = tab ? state.message : 'Open Facebook first.';

  const button = document.getElementById('toggle');
  button.textContent = state.active ? 'Pause' : 'Start unfollow';
  button.classList.toggle('pause', state.active);
  button.disabled = !tab || (!state.active && !isFollowing);

  const cancelButton = document.getElementById('cancelRequests');
  cancelButton.disabled = !tab || state.active || !isRequests;
}

document.getElementById('toggle').addEventListener('click', async () => {
  const state = await getState();
  const tab = await getFacebookTab();
  if (!tab) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: state.active ? 'pause' : 'start' });
    await render();
  } catch {
    document.getElementById('status').textContent = 'Refresh the Facebook tab, then try again.';
  }
});

document.getElementById('cancelRequests').addEventListener('click', async () => {
  const tab = await getFacebookTab();
  if (!tab) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'cancel-sent-requests' });
    await render();
  } catch {
    document.getElementById('status').textContent = 'Refresh the Facebook tab, then try again.';
  }
});

chrome.storage.onChanged.addListener(render);
render();
