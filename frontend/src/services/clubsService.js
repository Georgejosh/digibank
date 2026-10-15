import api, { USE_MOCK_API } from './api';
import { ENDPOINTS } from './endpoints';
import mockApi from './mockApi';

/** GET /api/clubs/ -> groups joined with their group savings_account. */
export async function listClubs() {
  if (USE_MOCK_API) return mockApi.listClubs();
  const { data } = await api.get(ENDPOINTS.clubs.list);
  return data;
}

/** POST /api/clubs/ - Django creates the group, the creator's group_members
 *  row and the GROUP savings_account in one transaction, then sends invites. */
export async function createClub(payload) {
  if (USE_MOCK_API) return mockApi.createClub(payload);
  const { data } = await api.post(ENDPOINTS.clubs.list, payload);
  return data;
}

/** GET /api/clubs/{id}/ - members, contributions, shares, invite history. */
export async function getClub(id) {
  const { data } = await api.get(ENDPOINTS.clubs.detail(id));
  return data;
}

/** POST /api/clubs/{id}/invite/ { emails } - creator only. */
export async function inviteToClub({ clubId, emails }) {
  const { data } = await api.post(ENDPOINTS.clubs.invite(clubId), { emails });
  return data;
}

/** POST /api/clubs/{id}/split/ { enabled } - creator only. */
export async function setClubSplit({ clubId, enabled }) {
  const { data } = await api.post(ENDPOINTS.clubs.split(clubId), { enabled });
  return data;
}

/** POST /api/clubs/{id}/code/ - creator retires the old join code. */
export async function newClubCode(clubId) {
  const { data } = await api.post(ENDPOINTS.clubs.code(clubId));
  return data;
}

/** POST /api/clubs/join/ { code } - asks the creator to let you in. */
export async function joinClub(code) {
  const { data } = await api.post(ENDPOINTS.clubs.join, { code });
  return data;
}

/** GET /api/clubs/invitations/ - invites for me + my join requests. */
export async function listInvitations() {
  const { data } = await api.get(ENDPOINTS.clubs.invitations);
  return data;
}

/** POST .../respond/ { action: 'accept' | 'decline' } */
export async function respondInvitation({ id, action }) {
  const { data } = await api.post(ENDPOINTS.clubs.respond(id), { action });
  return data;
}

/** POST .../cancel/ - creator withdraws an invite, or you withdraw a request. */
export async function cancelInvitation(id) {
  const { data } = await api.post(ENDPOINTS.clubs.cancel(id));
  return data;
}
