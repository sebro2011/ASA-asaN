/** Exercise the actual migration in an embedded PostgreSQL-compatible engine. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const submitter = '11111111-1111-4111-8111-111111111111';
const moderator = '22222222-2222-4222-8222-222222222222';
const reporter = '33333333-3333-4333-8333-333333333333';
const video = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const report = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const secondReport = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

test('community SQL restricts direct access, enforces durable limits and atomically moderates', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users (id uuid primary key);`);
    await db.exec(await readFile(new URL('../supabase/cosmovision.sql', import.meta.url), 'utf8'));
    await db.query('insert into auth.users (id) values ($1), ($2), ($3)', [submitter, moderator, reporter]);
    await db.query('insert into public.cosmovision_moderators (user_id) values ($1)', [moderator]);
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.cosmovision_videos'), /permission denied/i);
    await assert.rejects(db.query("select public.cosmovision_consume_limit('11111111-1111-4111-8111-111111111111', 'submit')"), /permission denied/i);
    await db.exec('reset role; set role authenticated');
    await assert.rejects(db.query('select * from public.cosmovision_moderators'), /permission denied/i);
    await assert.rejects(db.query('select * from public.cosmovision_reports'), /permission denied/i);
    await db.exec('reset role; set role service_role');
    const limit = async (id, action) => (await db.query('select public.cosmovision_consume_limit($1, $2) as allowed', [id, action])).rows[0].allowed;
    for (let n = 0; n < 5; n++) assert.equal(await limit(submitter, 'submit'), true);
    assert.equal(await limit(submitter, 'submit'), false);
    assert.equal(await limit(reporter, 'submit'), true, 'limits are per user');
    assert.equal(await limit(submitter, 'unknown'), false);
    await db.query("update public.cosmovision_rate_limits set window_start = now() - interval '2 hours' where user_id = $1 and action = 'submit'", [submitter]);
    assert.equal(await limit(submitter, 'submit'), true, 'expired window resets');
    await db.query(`insert into public.cosmovision_videos
      (id, video_id, title, description, category, channel_title, submitter_id)
      values ($1, 'abcdefghijk', 'Mars science', 'A science video about Mars.', 'missions', 'Creator', $2)`, [video, submitter]);
    await assert.rejects(db.query(`insert into public.cosmovision_videos
      (video_id, title, description, category, channel_title, submitter_id)
      values ('abcdefghijk', 'Duplicate', 'Duplicate video description', 'missions', 'Creator', $1)`, [reporter]), /duplicate key/i);
    const act = async (id, user, action) => (await db.query('select public.cosmovision_moderate($1,$2,$3) as changed', [id, user, action])).rows[0].changed;
    assert.equal(await act(video, submitter, 'approve'), false, 'ordinary users cannot moderate');
    assert.equal(await act(video, moderator, 'takedown'), false, 'pending cannot be taken down as approved');
    assert.equal(await act(video, moderator, 'approve'), true);
    assert.equal(await act(video, moderator, 'approve'), false, 'repeat transition fails');
    await db.query("insert into public.cosmovision_reports (id,video_id,reporter_id,reason) values ($1,$2,$3,'Please review this video')", [report, video, reporter]);
    const dismiss = async (id, user) => (await db.query('select public.cosmovision_dismiss_report($1,$2) as changed', [id, user])).rows[0].changed;
    assert.equal(await dismiss(report, submitter), false);
    assert.equal(await dismiss(report, moderator), true);
    assert.equal(await dismiss(report, moderator), false);
    await db.query("insert into public.cosmovision_reports (id,video_id,reporter_id,reason) values ($1,$2,$3,'Another review request')", [secondReport, video, submitter]);
    assert.equal(await act(video, moderator, 'takedown'), true);
    const state = (await db.query('select status, reviewed_by from public.cosmovision_videos where id=$1', [video])).rows[0];
    assert.equal(state.status, 'rejected'); assert.equal(state.reviewed_by, moderator);
    assert.equal((await db.query('select status from public.cosmovision_reports where id=$1', [secondReport])).rows[0].status, 'resolved');
  } finally { await db.close(); }
});
