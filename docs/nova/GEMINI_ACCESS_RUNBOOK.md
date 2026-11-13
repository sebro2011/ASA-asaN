# Gemini access — console runbook (Sinhala)

> **තත්ත්වය 2026-11-13 (post-merge):** NOVA production එකේ Gemini generation **වැඩ නොකරයි** — pin කර ඇති `gemini-3.8-flash` දැන් **429 quota exceeded** ද, සියලු විකල්ප 503/404 ද වේ (§3-B). හේතුව මනිනු ලැබ ඇත — ප්‍රතික්ෂේපය **upstream** එකෙන්, අපගේ code, key හෝ config එකෙන් නොවේ.
> මෙම ලේඛනය කේත වෙනසක් නොවේ; Vercel/Google console එකේ කළ යුතු **ක්‍රියා පිළිවෙල**යි. කේතය සම්පූර්ණ වී ඇත — `docs/API_STATUS_REPORT.md`, audit **M4** (`docs/audits/MASTER_AUDIT_REPORT.md`).

## 1. දැන් තත්ත්වය (මනින ලද, අනුමාන නොවේ)

Live probes තුනක්, `2026-11-13` 15:57–15:59Z, deployment `aeb601e`:

| පරීක්ෂණය | ප්‍රතිඵලය | අර්ථය |
| --- | --- | --- |
| `GET /v1beta/models` | **200**, 69–76 ms, මාදිලි 49 | key එක **සුවපත්‍ය**; auth/quota-402 ප්‍රශ්නයක් නැත |
| `gemini-3.8-flash` | **503 `UNAVAILABLE`** | model එක තිබේ, නමුත් වැඩ භාර නොගනී |
| `gemini-2.5-flash` | **404 `MODEL_NOT_FOUND`** | key එකේ ලැයිස්තුවේ තිබියදීත් — "ලැයිස්තුව = අවසරය" නොවේ |
| `openrouter/free` | **200** | NOVA ට පිළිතුරු දෙන්නේ මෙයින් |
| local engine | `ok` | සහායක මාර්ගය |

Provider ගේ පිළිතුර, තෙවරම:

```json
{ "error": { "code": 503, "message": "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.", "status": "UNAVAILABLE" } }
```

**වැදගත්:** `NOVA_GEMINI_MODEL` දැනටමත් set කර ඇත — අගය **`gemini-3.8-flash`**, type `plain`, targets `production`+`preview`+`development`, env id `vTnXoATsN5lltQVo`. එනම් pin එකක් "නැති" නොවේ; එය **503 දෙන id එකටම** pin වී ඇත. අලුතින් create කිරීම නොව **එය update කිරීම**යි අවශ්‍ය.

Production එකේ ඇති/නැති keys (අගයන් decrypt නොකර, key නාම පමණි):

| Key | Targets | තත්ත්වය |
| --- | --- | --- |
| `GEMINI_API_KEY` | all | ඇත — `keyValid: true` |
| `NOVA_GEMINI_MODEL` | all | ඇත — `gemini-3.8-flash` (ප්‍රශ්නය මෙයයි) |
| `OPENROUTER_API_KEY` | all | ඇත — 200 |
| `NASA_API_KEY`, `YOUTUBE_API_KEY` | all | ඇත |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | all | ඇත (server/service key එකක් නැත) |
| `GUARDIAN_ADMIN_TOKEN`, `CRON_SECRET`, `GUARDIAN_NEWS_API_KEY`, `ARENA_*`, `DATABASE_URL` | — | **නැත** (මේවා M4 ට අදාළ නොවේ) |

## 2. තීරණ ගස (මුලින්ම මෙය කියවන්න)

```
probe එකේ gemini.status  ─┬─ "ok"            → ✅ pin එක හරි. §6 rollback අවශ්‍ය නැත.
                          ├─ 503/429         → මාදිලිය තාවකාලිකව busy → §5 (කිසිවක් වෙනස් නොකර නැවත උත්සාහ)
                          ├─ 404 (සියලු id)  → project එකට access නැත → §4 (Google Cloud/AI Studio)
                          └─ 401/403/402     → key ප්‍රශ්නයක් → §4 (key එක නැවත සාදන්න / billing)
```

"404 (සියලු id)" යන්න තහවුරු කිරීමට **එක් උත්සාහයකින් සියලු id දැකිය හැකි ක්‍රමයක්** අවශ්‍යයි — ඒ සඳහා `modelAttempts` (පහත §3-B).

## 3. සාක්ෂිය ලබා ගැනීම — ක්‍රම දෙකක්

### A. deploy කර ඇති build එකේ `modelAttempts` ඇත්නම් (නිර්දේශිත)

මෙම branch (`6316825`) deploy වූ පසු, `GET /api/nova/diagnostics?probe=1` හි `providers.gemini` තුළ:

```json
"modelsTried":    ["gemini-3.8-flash", "gemini-flash-latest", "gemini-2.5-pro", "gemini-2.5-flash-lite", "gemini-2.5-flash"],
"modelAttempts": [
  { "model": "gemini-flash-latest",  "ok": false, "httpStatus": 404, "code": "PROVIDER_MODEL_NOT_FOUND", "ms": 150 },
  { "model": "gemini-2.5-pro",       "ok": false, "httpStatus": 503, "code": "PROVIDER_UNAVAILABLE",    "ms": 400 },
  { "model": "gemini-2.5-flash-lite","ok": false, "httpStatus": 404, "code": "PROVIDER_MODEL_NOT_FOUND", "ms": 148 },
  { "model": "gemini-2.5-flash",     "ok": false, "httpStatus": 404, "code": "PROVIDER_MODEL_NOT_FOUND", "ms": 149 }
]
```

(ඉහත අගයන් **උදාහරණයක්** පමණි — හැඩය පෙන්වීමට. සැබෑ අගයන් deploy එකෙන් පසු probe එකෙන් ලැබේ.)

කියවීම:
- **`"ok": true` ඇති පේළියක්** → එම id එක pin කරන්න (§4 වෙනුවට §3-B).
- **සියල්ල 404** → `modelAttempts` එක පමණක් නොව `suggestedModel` ද බලන්න; එය පවසන්නේ *"this id may be listed for the key yet restricted by access"* වගේ පණිවිඩයක් — එවිට §4.
- **503 / 429** → §5.

### B. **මිනුම් කර අවසන් — pin කිරීම විසඳුමක් නොවේ** (2026-11-13, production `44c2cc7`)

PR #54 merge වී production එක `44c2cc7` ට ගිය පසු `modelAttempts` සහිතව probe එක ලබා ගන්නා ලදී. **සියලු id වල සැබෑ තත්ත්වය දැන් දන්නා බැවින්** පෙර පිටපතේ තිබූ "එකින් එක pin කර උත්සාහ කරන්න" උපදෙස **ඉවත් කර ඇත**:

| උත්සාහය (පිළිවෙලින්) | තත්ත්වය | `code` | ms |
| --- | --- | --- | --- |
| `gemini-3.8-flash` (pin වී ඇති) | **429** | `UPSTREAM_RATE_LIMITED` | 124 |
| `gemini-flash-latest` | **503** | `PROVIDER_UNAVAILABLE` | 721 |
| `gemini-2.5-pro` | **404** | `PROVIDER_MODEL_NOT_FOUND` | 147 |
| `gemini-2.5-flash-lite` | **404** | `PROVIDER_MODEL_NOT_FOUND` | 136 |
| `gemini-2.5-flash` | **404** | `PROVIDER_MODEL_NOT_FOUND` | 149 |

429 හි පෙළ: *"You exceeded your current quota, please check your plan and billing details."*

**අර්ථය:** වෙනත් id එකකට pin කිරීමෙන් මෙය විසඳෙන්නේ නැත — `gemini-flash-latest` පමණක් තවම පවතී (එයත් 503), අනෙක් තුන 404 ය. එබැවින් ඊළඟ පියවර **§4.1 නොවේ**; **§7 (quota/plan/billing)** ය. පැරණි deployment එකක් මතට වැටුණොත් පමණක් ඉහත වගුව පිටපත් කරගෙන එක් id එකක් තෝරා §4.1 අනුගමනය කරන්න.

## 4. Console ක්‍රියා — පියවරෙන් පියවර

### 4.1 `NOVA_GEMINI_MODEL` වෙනස් කිරීම (Vercel)

1. Vercel → team **`lucky-5048`** → project **`nasa-space-explorer.`**
2. **Settings → Environment Variables** → සොයන්න `NOVA_GEMINI_MODEL`
3. ⋯ → **Edit** → Value එක වෙනස් කරන්න — **නමුත් §3-B කියවා ඇත්නම් මෙය අවශ්‍ය නොවන බව පෙනේ** (pin කිරීමෙන් මෙය විසඳෙන්නේ නැත)
   - Targets තුනම (`Production`, `Preview`, `Development`) එලෙසම තබන්න
   - Type: `plain` (රහසක් නොවේ; model id එකක් පමණි)
4. **Save**
5. ⚠️ **Env වෙනසක් පමණින් ක්‍රියාත්මක නොවේ** — දැනට ධාවනය වන function එකට පැරණි අගයම ලැබී ඇත. නව deployment එකක් අවශ්‍යයි:
   - **Deployments** → ඉහළම production deployment → ⋯ → **Redeploy**
   - (ලැඟුම් වළක්වන්න: `main` ට පමණක්; branch එකක් deploy නොකරන්න)
6. Redeploy එක **Ready** වනතුරු රැඳී සිටින්න (සාමාන්‍යයෙන් 1–3 මිනිත්තුවක්)

### 4.2 ප්‍රතිඵලය කියවීම

```bash
https://nasa-space-expolere.vercel.app/api/nova/diagnostics?probe=1&recheck=<ඕනෑම අංකයක්>
```

- `&recheck=…` **අත්‍යවශ්‍යයි** — නැත්නම් edge cache එක පැරණි JSON එකම (එකම `checkedAt`) ලබා දෙයි. මෙය 2026-11-13 මිනුමේදීම සිදු විය: එකම URL දෙවරක් ගත් විට `checkedAt` වෙනස් නොවී තිබුණි, අලුත් query parameter එකක් එකතු කිරීමෙන් පසුව පමණක් අලුත් මිනුමක් ලැබුණි.
- `"probed": true` සහ `"throttled": false` දෙකම තහවුරු කරගන්න; `throttled: true` නම් තත්පර 10ක් රැඳී නැවත උත්සාහ කරන්න.
- `deployment` ක්ෂේත්‍රයෙන් ඔබ redeploy කළ commit එකම දැයි තහවුරු කරගන්න.

`code` ක්ෂේත්‍රයේ අගය අනුව (`server/novaDiagnostics.js` හි `codeForStatus`):

| `code` | HTTP | අර්ථය | පියවර |
| --- | --- | --- | --- |
| `OK` | 200 | ජනනය සාර්ථක | ✅ අවසන් |
| `PROVIDER_UNAVAILABLE` | ≥ 500 | මාදිලිය busy | §5 (කිසිවක් වෙනස් නොකරන්න) |
| `UPSTREAM_RATE_LIMITED` | 429 | quota/rate | §5, පසුව §7 (quota) |
| `PROVIDER_MODEL_NOT_FOUND` | 404 | මෙම id එක **මෙම project එකට** නොගැලපේ | §7 (සියලු id වල තත්ත්වය §3-B හි ඇත) |
| `PROVIDER_AUTH_ERROR` | 401/403 | key පිළිගැනීමක් නැත | §7.4 (key නැවත සාදන්න) |
| `PROVIDER_CREDIT_REQUIRED` | 402 | billing | §7.3 |
| `AI_TIMEOUT` | 408/504 | මන්දගාමී | නැවත probe කරන්න |
| `PROVIDER_REJECTED` | වෙනත් 4xx | ඉල්ලීම ප්‍රතික්ෂේප | report එකේ `reason` කියවන්න |

### 4.3 "සාර්ථක" යන්න පෙනෙන ආකාරය

```json
"gemini": {
  "configured": true,
  "model": "<ඔබ pin කළ id එක>",
  "status": "ok",
  "code": "OK",
  "httpStatus": 200,
  "reachable": true,
  "keyValid": true
}
```

එවිට **§3-B අවසන්** — එම අගයම තබන්න. තවත් වෙනස්කම් අවශ්‍ය නැත.

## 5. 503 හෝ 429 තත්ත්වය නම්

503 යනු *"ඔබගේ project එකට අවසර නැත"* නොවේ; *"දැන් ඉල්ලුම වැඩියි"* යන්නයි. 429 යනු *"quota ඉක්මවා ඇත"* යන්නයි. එබැවින්:

1. **කිසිවක් වෙනස් නොකරන්න.** `gemini-3.8-flash` හෝ `gemini-flash-latest` මත තබන්න.
2. පැයකට වරක් පමණ `?probe=1&recheck=<n>` ධාවනය කරන්න. `status: "ok"` ලැබුණු විට අවසන්.
3. NOVA එකට මේ කාලය තුළ බලපෑමක් නැත: OpenRouter (`openrouter/free`, 200) සහ local engine `ok`. UI එකේ provider එක *configured* ලෙස පෙන්වයි, *healthy* ලෙස නොවේ — එය නිවැරදිය.
4. **429** ලැබෙන විට කිසිවක් වෙනස් නොකර **§7** ට යන්න: එය quota/plan ප්‍රශ්නයක් (2026-11-13 17:50Z හි දැක්කේ 429). දිගු කාලයක් 503/429 පවතී නම් (2026-11-09, -10, -12, -13 යන දිනවල එසේ විය) ද එයම කරන්න.

## 6. Rollback

වෙනස්කම් අසාර්ථක නම්:

1. Settings → Environment Variables → `NOVA_GEMINI_MODEL` → `gemini-3.8-flash` ට ආපසු
2. Redeploy
3. තහවුරු කරන්න: probe එකේ `model` = `gemini-3.8-flash` සහ `code` = `PROVIDER_UNAVAILABLE` (එනම් පෙර තත්ත්වයම)

`NOVA_GEMINI_MODEL` ඉවත් කළහොත් code එකේ default එක (`server/novaChat.js` හි `DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash'`) භාවිතා වේ — එබැවින් env var එක delete කිරීම වඩා හොඳ තත්ත්වයක් ඇති නොකරයි.

## 7. Google Cloud / AI Studio පැත්ත (සියලු id 404 නම් හෝ 401/403/402 නම්)

404 පිළිතුරේ පෙළ ම පවසන්නේ මෙයයි: *"no longer available to new users … use models/gemini-3.8-flash"*. එනම් Google මෙම **key එකේ project එක** "නව" එකක් ලෙස සලකයි. එබැවින්:

1. **AI Studio → API keys** → මෙම key එක අයිති **Google Cloud project** එක හඳුනාගන්න.
2. එම project එකේ **Generative Language API** සක්‍රීය දැයි බලන්න (Cloud console → APIs & Services → Enabled APIs).
3. **Billing** සක්‍රීය දැයි බලන්න — free tier එකේදී මාදිලි සීමා විය හැක.
4. අවශ්‍ය නම් එම project එකේම **නව key එකක්** සාදා `GEMINI_API_KEY` එක update කරන්න (targets තුනම), ඉන්පසු **Redeploy**.
5. නැවතත් §4.2 probe එක.

කිසිදු අවස්ථාවක key එකක අගය chat, git, හෝ doc එකක ලියන්න එපා. `get_env_var` මගින් decrypt කර කියවීම ද අවශ්‍ය නැත — probe එක `keyValid: true/false` ලෙස පිළිතුරු දෙයි.

## 8. අවසාන තහවුරු කිරීම (සම්පූර්ණ කළ පසු)

1. `?probe=1&recheck=<n>` → `gemini.status: "ok"`
2. UI එකේ NOVA වෙත ප්‍රශ්නයක් යවන්න → පිළිතුරේ provider ලෙස Gemini දිස්වේ ද බලන්න
3. `server/novaDiagnostics.js` හි `modelAttempts` සහ `suggestedModel` හේතුව නැති වූ බැවින් ඒවා ඉවත් නොකරන්න — ඊළඟ වතාවේදී එකම ප්‍රශ්නය නැවත ඇති වුවහොත් ඒවා නැවත මිනුම් කිරීම වළක්වයි.

---

**සම්බන්ධ ලේඛන:** `docs/nova/AI_PROVIDER_DIAGNOSTICS.md` (ක්ෂේත්‍ර විස්තරය සහ code වගුව) · `docs/API_STATUS_REPORT.md` (සජීවී මිනුම) · `docs/audits/MASTER_AUDIT_REPORT.md` § M4 · `docs/nova/DEPLOYMENT_TROUBLESHOOTING.md`
