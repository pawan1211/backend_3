const axios = require('axios');
require('dotenv').config();

const ZOOM_API  = 'https://api.zoom.us/v2';
const TOKEN_URL = 'https://zoom.us/oauth/token';

let tokenCache = { token: null, expiresAt: 0 };

const getAccessToken = async () => {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const credentials = Buffer.from(
    process.env.ZOOM_CLIENT_ID + ':' + process.env.ZOOM_CLIENT_SECRET
  ).toString('base64');

  const { data } = await axios.post(
    TOKEN_URL + '?grant_type=account_credentials&account_id=' + process.env.ZOOM_ACCOUNT_ID,
    null,
    { headers: { Authorization: 'Basic ' + credentials } }
  );

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return tokenCache.token;
};

const zoomApi = async (method, path, body) => {
  const token = await getAccessToken();
  const { data } = await axios({
    method, url: ZOOM_API + path, data: body,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  });
  return data;
};

const createZoomMeeting = async ({ topic, scheduledAt, durationMins = 60, hostEmail, clientName }) => {
  const startTime = new Date(scheduledAt).toISOString().replace('.000', '');
  const password  = Math.random().toString(36).slice(2, 8).toUpperCase();

  const meeting = await zoomApi('POST', '/users/' + hostEmail + '/meetings', {
    topic: 'NexusIT: ' + topic.slice(0, 80),
    type: 2,
    start_time: startTime,
    duration: durationMins,
    timezone: 'UTC',
    password,
    agenda: 'Consultation with ' + clientName,
    settings: {
      host_video: true,
      participant_video: true,
      waiting_room: true,
      mute_upon_entry: true,
    },
  });

  return {
    meetingId: String(meeting.id),
    joinUrl:   meeting.join_url,
    startUrl:  meeting.start_url,
    password:  meeting.password,
  };
};

const deleteZoomMeeting = async (meetingId) => {
  try {
    await zoomApi('DELETE', '/meetings/' + meetingId);
    return { success: true };
  } catch (err) {
    if (err.response?.status === 404) return { success: true };
    throw err;
  }
};

module.exports = { createZoomMeeting, deleteZoomMeeting };
