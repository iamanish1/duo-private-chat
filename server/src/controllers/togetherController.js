import * as together from '../services/togetherService.js';
import * as lists from '../services/listService.js';

// "Thinking of you" tap
export async function nudge(req, res) {
  await together.sendNudge(req.session);
  res.status(204).end();
}

// Days together & countdowns (shared; either person can edit)
export async function getTogether(req, res) {
  res.json({ together: await together.getTogether(req.session) });
}
export async function setSince(req, res) {
  res.json({ together: await together.setSince(req.session, req.valid.body.since) });
}
export async function addEvent(req, res) {
  res.status(201).json({ together: await together.addEvent(req.session, req.valid.body) });
}
export async function updateEvent(req, res) {
  res.json({ together: await together.updateEvent(req.session, req.valid.params.id, req.valid.body) });
}
export async function removeEvent(req, res) {
  res.json({ together: await together.removeEvent(req.session, req.valid.params.id) });
}

// Shared lists
export async function getLists(req, res) {
  res.json({ lists: await lists.listLists(req.session) });
}
export async function createList(req, res) {
  res.status(201).json({ list: await lists.createList(req.session, req.valid.body) });
}
export async function updateList(req, res) {
  res.json({ list: await lists.updateList(req.session, req.valid.params.id, req.valid.body) });
}
export async function deleteList(req, res) {
  await lists.deleteList(req.session, req.valid.params.id);
  res.status(204).end();
}
export async function addItem(req, res) {
  res.status(201).json({ list: await lists.addItem(req.session, req.valid.params.id, req.valid.body.text) });
}
export async function updateItem(req, res) {
  res.json({ list: await lists.updateItem(req.session, req.valid.params.id, req.valid.params.itemId, req.valid.body) });
}
export async function removeItem(req, res) {
  res.json({ list: await lists.removeItem(req.session, req.valid.params.id, req.valid.params.itemId) });
}
