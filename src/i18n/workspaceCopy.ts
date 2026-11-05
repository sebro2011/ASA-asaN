/**
 * NOVA workspace copy (Phase 3A).
 *
 * Kept in its own typed module — like `interfaceCopy.ts` — so translators can
 * review one file and the shell can never silently fall back to English.
 * Merged into the i18next resources in src/i18n.ts.
 *
 * Rule for this file: every key exists in all three languages. The parity test
 * (scripts/test-workspace-shell.mjs) fails the suite if that stops being true.
 */

export type CopyLanguage = 'en' | 'si' | 'ta';
type Copy = Record<string, string>;

const en: Copy = {
  /* ---------------------------------------------------------------- shell */
  wsMenuChat: 'Chat',
  wsMenuProjects: 'Projects',
  wsMenuDocuments: 'Documents',
  wsMenuWriting: 'Writing Studio',
  wsMenuResearch: 'Research',
  wsMenuCode: 'Code Studio',
  wsMenuKnowledge: 'Knowledge Space',
  wsMenuTasks: 'Tasks',

  wsWorkspace: 'Workspace',
  wsExplore: 'Explore',
  wsNewChat: 'New chat',
  wsSearch: 'Search',
  wsSearchHint: 'Search NOVA…',
  wsOpenCommandPalette: 'Open search and commands',
  wsOpenMenu: 'Open navigation',
  wsCloseMenu: 'Close navigation',
  wsCollapseSidebar: 'Collapse sidebar',
  wsExpandSidebar: 'Expand sidebar',
  wsDestinations: 'Destinations',
  wsSettings: 'Settings',
  wsProfile: 'Profile',
  wsAccount: 'Account',
  wsTheme: 'Theme',
  wsThemeDark: 'Dark',
  wsThemeLight: 'Light',
  wsThemeSystem: 'System',
  wsToggleTheme: 'Switch appearance',
  wsLanguage: 'Language',
  wsPlannedFlag: 'Soon',
  wsSkipToContent: 'Skip to workspace content',
  wsMainNavigation: 'Workspace navigation',
  wsMobileNavigation: 'Primary navigation',
  wsMore: 'More',
  wsDrawerNavigation: 'Navigation menu',
  wsOn: 'on',
  wsOff: 'off',

  /* ------------------------------------------------------------- command */
  wsCommandTitle: 'Search or jump to',
  wsCommandPlaceholder: 'Type a destination, setting or action…',
  wsCommandNavigate: 'Workspace',
  wsCommandExplore: 'Explore NASA science',
  wsCommandAppearance: 'Appearance',
  wsCommandLanguage: 'Language',
  wsCommandEmpty: 'No matches',
  wsCommandClose: 'Close search',

  /* ---------------------------------------------------------------- home */
  wsGoodMorning: 'Good morning',
  wsGoodAfternoon: 'Good afternoon',
  wsGoodEvening: 'Good evening',
  wsHomeSubtitle: 'Your AI workspace for thinking, writing and organising — with NASA science built in.',
  wsHomeShellNote:
    'This build is the NOVA foundation: branding, themes, routing and the workspace shell. The complete Explore suite is live; workspace modules are enabled phase by phase and never shown as working before they are.',
  wsAvailableNow: 'Available now',
  wsAppearanceTitle: 'Appearance',
  wsAppearanceBody: 'Choose a palette. Your choice is remembered on this device.',
  wsModulesTitle: 'Workspace modules',
  wsModulesBody: 'Each module is listed with the build phase that enables it.',
  wsAiStatusTitle: 'AI providers',
  wsChecking: 'Checking…',
  wsAiOfflineOnly: 'No online provider is configured on this server, so NOVA can only answer from its offline knowledge base.',
  wsAiConfigured: 'Configured on this server: {{providers}}',
  wsAiNone: 'Unavailable',
  wsExploreCardTitle: 'Explore NASA science',
  wsExploreCardBody:
    'APOD, the Earth Intelligence Lab (NASA POWER and GIBS), missions, orbit tracking, near-Earth objects, 3D and the NOVA space assistant — all unchanged.',
  wsOpenExplore: 'Open Explore',
  wsPhaseLabel: 'Phase {{phase}}',
  wsPlanned: 'Planned',

  /* -------------------------------------------------------------- planned */
  wsNotAvailable: 'Not available yet',
  wsPlannedBody:
    'This module is scheduled for Phase {{phase}}. Its navigation entry exists so the workspace structure is complete — nothing here is simulated, and no data is created or stored yet.',
  wsPlannedCapabilities: 'What this module will do',
  wsNoSimulation: 'No placeholder data, no fake history, no disabled controls that pretend to work.',
  wsBackHome: 'Back to home',
  wsBackToWorkspace: 'Back to workspace',
  wsExploreInstead: 'Explore NASA science instead',

  /* ------------------------------------------------------------ explore */
  wsExploreEyebrow: 'NASA science suite',
  wsExploreTitle: 'Explore',
  wsExploreBody:
    'Fifteen NASA destinations, preserved in full: imagery, Earth observation, missions, orbital tracking and the trilingual space assistant.',

  /* ---------------------------------------------------------- not found */
  wsNotFoundTitle: 'This page does not exist',
  wsNotFoundBody: 'The address does not match a NOVA workspace destination or an Explore page.',

  /* -------------------------------------------------------------- areas */
  wsAreaChatDesc:
    'ChatGPT-class conversations with real token streaming, history, search, rename, archive and project context.',
  wsAreaChatB1: 'Streaming answers with stop, regenerate and copy',
  wsAreaChatB2: 'Conversation list, search, pin, archive and restore',

  wsAreaProjectsDesc: 'Group conversations, documents and tasks under a project with its own instructions.',
  wsAreaProjectsB1: 'Project instructions applied to every answer',
  wsAreaProjectsB2: 'Related conversations, documents and tasks in one place',

  wsAreaDocumentsDesc: 'Create, edit and export documents, with AI actions that never overwrite your text.',
  wsAreaDocumentsB1: 'Autosave, revisions and undo',
  wsAreaDocumentsB2: 'Summarise, rewrite, outline and export',

  wsAreaWritingDesc: 'A focused writing environment for essays, reports, emails and proposals.',
  wsAreaWritingB1: 'Tone, length and structure controls',
  wsAreaWritingB2: 'Accept, reject or insert suggestions side by side',

  wsAreaResearchDesc: 'Structure a research question, capture findings and keep a source register you control.',
  wsAreaResearchB1: 'Comparison tables and key findings',
  wsAreaResearchB2: 'Sources are user-supplied and labelled — never invented',

  wsAreaCodeDesc: 'Explain, generate, review and document code — with no pretence of execution.',
  wsAreaCodeB1: 'Language-aware formatting and diffs',
  wsAreaCodeB2: 'States clearly that code is not run here',

  wsAreaKnowledgeDesc: 'Upload your own reference files and ask questions about what actually loaded.',
  wsAreaKnowledgeB1: 'Private per-user storage',
  wsAreaKnowledgeB2: 'Text files are indexed; others are labelled metadata-only',

  wsAreaTasksDesc: 'Plan and track work, connect it to projects and turn goals into reviewable task lists.',
  wsAreaTasksB1: 'Status, priority and due dates',
  wsAreaTasksB2: 'AI plans write nothing until you approve',

  wsAreaSettingsDesc: 'Appearance, language, chat, workspace, accessibility and data controls.',
  wsAreaSettingsB1: 'Only controls that actually work',
  wsAreaSettingsB2: 'Export and delete all of your data',

  wsAreaProfileDesc: 'Your account, display name and sign-out — with data export and deletion.',
  wsAreaProfileB1: 'Secure sign-in with session management',
  wsAreaProfileB2: 'Delete your account and data on request',
};

const si: Copy = {
  /* ---------------------------------------------------------------- shell */
  wsMenuChat: 'සංවාදය',
  wsMenuProjects: 'ව්‍යාපෘති',
  wsMenuDocuments: 'ලේඛන',
  wsMenuWriting: 'ලිවීම් ශාලාව',
  wsMenuResearch: 'පර්යේෂණ',
  wsMenuCode: 'කේත ශාලාව',
  wsMenuKnowledge: 'දැනුම් අවකාශය',
  wsMenuTasks: 'කාර්යයන්',

  wsWorkspace: 'වැඩ අවකාශය',
  wsExplore: 'ගවේෂණය',
  wsNewChat: 'නව සංවාදයක්',
  wsSearch: 'සොයන්න',
  wsSearchHint: 'NOVA තුළ සොයන්න…',
  wsOpenCommandPalette: 'සෙවීම සහ විධාන විවෘත කරන්න',
  wsOpenMenu: 'සංචාලනය විවෘත කරන්න',
  wsCloseMenu: 'සංචාලනය වසන්න',
  wsCollapseSidebar: 'පැති තීරුව හකුළන්න',
  wsExpandSidebar: 'පැති තීරුව දිග හරින්න',
  wsDestinations: 'ගමනාන්ත',
  wsSettings: 'සැකසුම්',
  wsProfile: 'පැතිකඩ',
  wsAccount: 'ගිණුම',
  wsTheme: 'තේමාව',
  wsThemeDark: 'අඳුරු',
  wsThemeLight: 'ආලෝකය',
  wsThemeSystem: 'පද්ධතිය',
  wsToggleTheme: 'පෙනුම මාරු කරන්න',
  wsLanguage: 'භාෂාව',
  wsPlannedFlag: 'ඉදිරියේදී',
  wsSkipToContent: 'වැඩ අවකාශයේ අන්තර්ගතයට යන්න',
  wsMainNavigation: 'වැඩ අවකාශ සංචාලනය',
  wsMobileNavigation: 'ප්‍රධාන සංචාලනය',
  wsMore: 'තව',
  wsDrawerNavigation: 'සංචාලන මෙනුව',
  wsOn: 'සක්‍රීය',
  wsOff: 'අක්‍රීය',

  /* ------------------------------------------------------------- command */
  wsCommandTitle: 'සොයන්න හෝ යන්න',
  wsCommandPlaceholder: 'ගමනාන්තයක්, සැකසුමක් හෝ ක්‍රියාවක් ලියන්න…',
  wsCommandNavigate: 'වැඩ අවකාශය',
  wsCommandExplore: 'නාසා විද්‍යාව ගවේෂණය කරන්න',
  wsCommandAppearance: 'පෙනුම',
  wsCommandLanguage: 'භාෂාව',
  wsCommandEmpty: 'ගැළපීම් නැත',
  wsCommandClose: 'සෙවීම වසන්න',

  /* ---------------------------------------------------------------- home */
  wsGoodMorning: 'සුබ උදෑසනක්',
  wsGoodAfternoon: 'සුබ දහවලක්',
  wsGoodEvening: 'සුබ සවසක්',
  wsHomeSubtitle: 'සිතීමට, ලිවීමට සහ සංවිධානය කිරීමට ඔබේ AI වැඩ අවකාශය — නාසා විද්‍යාව ද සමඟින්.',
  wsHomeShellNote:
    'මෙය NOVA හි අත්තිවාරමයි: සන්නාමය, තේමා, මාර්ගකරණය සහ වැඩ අවකාශ රාමුව. සම්පූර්ණ Explore කට්ටලය සක්‍රීයයි; වැඩ අවකාශ මොඩියුල අදියරෙන් අදියර සක්‍රීය වන අතර ක්‍රියාත්මක වීමට පෙර කිසිවක් ක්‍රියාකාරී ලෙස නොපෙන්වයි.',
  wsAvailableNow: 'දැන් ලබා ගත හැකි',
  wsAppearanceTitle: 'පෙනුම',
  wsAppearanceBody: 'වර්ණ පටලයක් තෝරන්න. ඔබේ තේරීම මෙම උපාංගයේ මතක තබා ගනී.',
  wsModulesTitle: 'වැඩ අවකාශ මොඩියුල',
  wsModulesBody: 'සෑම මොඩියුලයක්ම එය සක්‍රීය වන අදියර සමඟ දක්වා ඇත.',
  wsAiStatusTitle: 'AI සපයන්නන්',
  wsChecking: 'පරීක්ෂා කරමින්…',
  wsAiOfflineOnly: 'මෙම සේවාදායකයේ මාර්ගගත සපයන්නෙකු වින්‍යාස කර නැත, එබැවින් NOVA හට පිළිතුරු දිය හැක්කේ එහි නොබැඳි දැනුම් පදනමින් පමණි.',
  wsAiConfigured: 'මෙම සේවාදායකයේ වින්‍යාස කර ඇත: {{providers}}',
  wsAiNone: 'නොමැත',
  wsExploreCardTitle: 'නාසා විද්‍යාව ගවේෂණය කරන්න',
  wsExploreCardBody:
    'APOD, පෘථිවි බුද්ධි ආයතනය (NASA POWER සහ GIBS), මෙහෙයුම්, කක්ෂ කේතනය, පෘථිවියට ආසන්න වස්තු, 3D සහ NOVA අභ්‍යවකාශ සහායක — සියල්ල නොවෙනස්ව.',
  wsOpenExplore: 'Explore විවෘත කරන්න',
  wsPhaseLabel: 'අදියර {{phase}}',
  wsPlanned: 'සැලසුම් කර ඇත',

  /* -------------------------------------------------------------- planned */
  wsNotAvailable: 'තවම ලබා ගත නොහැක',
  wsPlannedBody:
    'මෙම මොඩියුලය අදියර {{phase}} සඳහා සැලසුම් කර ඇත. වැඩ අවකාශ ව්‍යුහය සම්පූර්ණ කිරීම සඳහා මෙම සංචාලන ඇතුළත් කිරීම පවතී — මෙහි කිසිවක් අනුකරණය නොකෙරේ, දැනට දත්ත නිර්මාණය හෝ ගබඩා නොකෙරේ.',
  wsPlannedCapabilities: 'මෙම මොඩියුලය කරන්නේ කුමක්ද',
  wsNoSimulation: 'ව්‍යාජ දත්ත නැත, ව්‍යාජ ඉතිහාසය නැත, වැඩ කරන බව පෙන්වන අක්‍රීය පාලක නැත.',
  wsBackHome: 'මුල් පිටුවට',
  wsBackToWorkspace: 'වැඩ අවකාශයට',
  wsExploreInstead: 'ඒ වෙනුවට නාසා විද්‍යාව ගවේෂණය කරන්න',

  /* ------------------------------------------------------------ explore */
  wsExploreEyebrow: 'නාසා විද්‍යා එකතුව',
  wsExploreTitle: 'ගවේෂණය',
  wsExploreBody:
    'නාසා ගමනාන්ත පහළොවක් සම්පූර්ණයෙන් ආරක්ෂා කර ඇත: රූප, පෘථිවි නිරීක්ෂණ, මෙහෙයුම්, කක්ෂ කේතනය සහ ත්‍රිභාෂා අභ්‍යවකාශ සහායක.',

  /* ---------------------------------------------------------- not found */
  wsNotFoundTitle: 'මෙම පිටුව නොපවතී',
  wsNotFoundBody: 'මෙම ලිපිනය NOVA වැඩ අවකාශ ගමනාන්තයකට හෝ Explore පිටුවකට නොගැළපේ.',

  /* -------------------------------------------------------------- areas */
  wsAreaChatDesc:
    'සැබෑ ටෝකන් ප්‍රවාහනය, ඉතිහාසය, සෙවීම, නැවත නම් කිරීම, ලේඛනාගාරය සහ ව්‍යාපෘති සන්දර්භය සහිත ChatGPT මට්ටමේ සංවාද.',
  wsAreaChatB1: 'නැවැත්වීම, නැවත උත්පාදනය සහ පිටපත් කිරීම සහිත ප්‍රවාහ පිළිතුරු',
  wsAreaChatB2: 'සංවාද ලැයිස්තුව, සෙවීම, අමුණා තැබීම, ලේඛනාගාරගත කිරීම සහ ප්‍රතිසාධනය',

  wsAreaProjectsDesc: 'සංවාද, ලේඛන සහ කාර්යයන් තමන්ගේම උපදෙස් සහිත ව්‍යාපෘතියක් යටතේ සංවිධානය කරන්න.',
  wsAreaProjectsB1: 'සෑම පිළිතුරකටම ව්‍යාපෘති උපදෙස් යෙදේ',
  wsAreaProjectsB2: 'අදාළ සංවාද, ලේඛන සහ කාර්යයන් එකම තැනක',

  wsAreaDocumentsDesc: 'ලේඛන සාදන්න, සංස්කරණය කරන්න, අපනයනය කරන්න — AI ක්‍රියා ඔබේ පෙළ කිසිදා උපරිලේඛනය නොකරයි.',
  wsAreaDocumentsB1: 'ස්වයං සුරැකුම, ප්‍රතිදෝෂ සහ ආපසු හැරවීම',
  wsAreaDocumentsB2: 'සාරාංශ කිරීම, නැවත ලිවීම, රූපරේඛාව සහ අපනයනය',

  wsAreaWritingDesc: 'ලිපි, වාර්තා, විද්‍යුත් තැපැල් සහ යෝජනා සඳහා ඒකාග්‍ර ලේඛන පරිසරයක්.',
  wsAreaWritingB1: 'ස්වරය, දිග සහ ව්‍යුහය පාලනය කිරීම',
  wsAreaWritingB2: 'යෝජනා පැත්තෙන් පැත්ත භාරගන්න, ප්‍රතික්ෂේප කරන්න හෝ ඇතුළත් කරන්න',

  wsAreaResearchDesc: 'පර්යේෂණ ප්‍රශ්නයක් ව්‍යුහගත කරන්න, සොයාගැනීම් සටහන් කරන්න, ඔබ පාලනය කරන මූලාශ්‍ර ලේඛනයක් තබා ගන්න.',
  wsAreaResearchB1: 'සංසන්දන වගු සහ ප්‍රධාන සොයාගැනීම්',
  wsAreaResearchB2: 'මූලාශ්‍ර පරිශීලක සැපයූ සහ ලේබල් කළ — කිසිදා නිර්මාණය නොකෙරේ',

  wsAreaCodeDesc: 'කේතය පැහැදිලි කරන්න, උත්පාදනය කරන්න, සමාලෝචනය කරන්න සහ ලේඛනගත කරන්න — ධාවනය කරන බවට කිසිදු ව්‍යාජයක් නැත.',
  wsAreaCodeB1: 'භාෂාව අනුව හැඩගැස්වීම සහ වෙනස්කම්',
  wsAreaCodeB2: 'කේතය මෙහි ධාවනය නොවන බව පැහැදිලිව පවසයි',

  wsAreaKnowledgeDesc: 'ඔබේම යොමු ගොනු උඩුගත කර සැබවින්ම පූරණය වූ දේ ගැන ප්‍රශ්න අසන්න.',
  wsAreaKnowledgeB1: 'පරිශීලකයාට පමණක් පෞද්ගලික ගබඩාව',
  wsAreaKnowledgeB2: 'පෙළ ගොනු දර්ශකගත වේ; අනෙක් ඒවා පාරදත්ත පමණක් ලෙස ලේබල් වේ',

  wsAreaTasksDesc: 'කාර්ය සැලසුම් කර නිරීක්ෂණය කරන්න, ව්‍යාපෘතිවලට සම්බන්ධ කරන්න, ඉලක්ක සමාලෝචනය කළ හැකි කාර්ය ලැයිස්තු බවට පත් කරන්න.',
  wsAreaTasksB1: 'තත්ත්වය, ප්‍රමුඛතාව සහ නියමිත දින',
  wsAreaTasksB2: 'AI සැලසුම් ඔබ අනුමත කරන තෙක් කිසිවක් ලියන්නේ නැත',

  wsAreaSettingsDesc: 'පෙනුම, භාෂාව, සංවාද, වැඩ අවකාශය, ප්‍රවේශ්‍යතාව සහ දත්ත පාලන.',
  wsAreaSettingsB1: 'සැබවින්ම ක්‍රියා කරන පාලක පමණි',
  wsAreaSettingsB2: 'ඔබේ සියලු දත්ත අපනයනය කර මකන්න',

  wsAreaProfileDesc: 'ඔබේ ගිණුම, දර්ශන නාමය සහ ඉවත් වීම — දත්ත අපනයනය සහ මැකීම සමඟ.',
  wsAreaProfileB1: 'සැසි කළමනාකරණය සහිත ආරක්ෂිත පිවිසුම',
  wsAreaProfileB2: 'ඉල්ලීම පරිදි ගිණුම සහ දත්ත මකන්න',
};

const ta: Copy = {
  /* ---------------------------------------------------------------- shell */
  wsMenuChat: 'உரையாடல்',
  wsMenuProjects: 'திட்டங்கள்',
  wsMenuDocuments: 'ஆவணங்கள்',
  wsMenuWriting: 'எழுத்து அரங்கம்',
  wsMenuResearch: 'ஆய்வு',
  wsMenuCode: 'குறியீட்டு அரங்கம்',
  wsMenuKnowledge: 'அறிவு வெளி',
  wsMenuTasks: 'பணிகள்',

  wsWorkspace: 'பணியிடம்',
  wsExplore: 'ஆராயுங்கள்',
  wsNewChat: 'புதிய உரையாடல்',
  wsSearch: 'தேடு',
  wsSearchHint: 'NOVA இல் தேடுங்கள்…',
  wsOpenCommandPalette: 'தேடல் மற்றும் கட்டளைகளைத் திற',
  wsOpenMenu: 'வழிசெலுத்தலைத் திற',
  wsCloseMenu: 'வழிசெலுத்தலை மூடு',
  wsCollapseSidebar: 'பக்கப்பட்டியைச் சுருக்கு',
  wsExpandSidebar: 'பக்கப்பட்டியை விரிவாக்கு',
  wsDestinations: 'இடங்கள்',
  wsSettings: 'அமைப்புகள்',
  wsProfile: 'சுயவிவரம்',
  wsAccount: 'கணக்கு',
  wsTheme: 'தோற்றம்',
  wsThemeDark: 'இருள்',
  wsThemeLight: 'ஒளி',
  wsThemeSystem: 'கணினி',
  wsToggleTheme: 'தோற்றத்தை மாற்று',
  wsLanguage: 'மொழி',
  wsPlannedFlag: 'விரைவில்',
  wsSkipToContent: 'பணியிட உள்ளடக்கத்திற்குச் செல்',
  wsMainNavigation: 'பணியிட வழிசெலுத்தல்',
  wsMobileNavigation: 'முதன்மை வழிசெலுத்தல்',
  wsMore: 'மேலும்',
  wsDrawerNavigation: 'வழிசெலுத்தல் மெனு',
  wsOn: 'இயக்கம்',
  wsOff: 'நிறுத்தம்',

  /* ------------------------------------------------------------- command */
  wsCommandTitle: 'தேடு அல்லது செல்',
  wsCommandPlaceholder: 'இடம், அமைப்பு அல்லது செயலைத் தட்டச்சு செய்யுங்கள்…',
  wsCommandNavigate: 'பணியிடம்',
  wsCommandExplore: 'நாசா அறிவியலை ஆராயுங்கள்',
  wsCommandAppearance: 'தோற்றம்',
  wsCommandLanguage: 'மொழி',
  wsCommandEmpty: 'பொருத்தங்கள் இல்லை',
  wsCommandClose: 'தேடலை மூடு',

  /* ---------------------------------------------------------------- home */
  wsGoodMorning: 'காலை வணக்கம்',
  wsGoodAfternoon: 'மதிய வணக்கம்',
  wsGoodEvening: 'மாலை வணக்கம்',
  wsHomeSubtitle: 'சிந்திக்க, எழுத, ஒழுங்கமைக்க உங்கள் AI பணியிடம் — நாசா அறிவியலுடன்.',
  wsHomeShellNote:
    'இது NOVA அடித்தளம்: பிராண்டிங், தோற்றங்கள், வழிசெலுத்தல் மற்றும் பணியிடச் சட்டகம். முழு Explore தொகுப்பும் செயலில் உள்ளது; பணியிட தொகுதிகள் கட்டங்களாக இயக்கப்படும், இயங்குவதற்கு முன் எதுவும் வேலை செய்வதாகக் காட்டப்படாது.',
  wsAvailableNow: 'இப்போது கிடைப்பவை',
  wsAppearanceTitle: 'தோற்றம்',
  wsAppearanceBody: 'ஒரு நிறத்தொகுப்பைத் தேர்ந்தெடுங்கள். உங்கள் தேர்வு இந்தச் சாதனத்தில் நினைவில் இருக்கும்.',
  wsModulesTitle: 'பணியிட தொகுதிகள்',
  wsModulesBody: 'ஒவ்வொரு தொகுதியும் அது இயக்கப்படும் கட்டத்துடன் பட்டியலிடப்பட்டுள்ளது.',
  wsAiStatusTitle: 'AI வழங்குநர்கள்',
  wsChecking: 'சரிபார்க்கிறது…',
  wsAiOfflineOnly:
    'இந்த சேவையகத்தில் இணைய வழங்குநர் அமைக்கப்படவில்லை, எனவே NOVA அதன் ஆஃப்லைன் அறிவுத் தளத்திலிருந்து மட்டுமே பதிலளிக்க முடியும்.',
  wsAiConfigured: 'இந்த சேவையகத்தில் அமைக்கப்பட்டவை: {{providers}}',
  wsAiNone: 'இல்லை',
  wsExploreCardTitle: 'நாசா அறிவியலை ஆராயுங்கள்',
  wsExploreCardBody:
    'APOD, பூமி நுண்ணறிவு ஆய்வகம் (NASA POWER மற்றும் GIBS), பயணங்கள், சுற்றுப்பாதை கண்காணிப்பு, பூமிக்கு அருகிலான பொருட்கள், 3D மற்றும் NOVA விண்வெளி உதவியாளர் — அனைத்தும் மாற்றமின்றி.',
  wsOpenExplore: 'Explore திற',
  wsPhaseLabel: 'கட்டம் {{phase}}',
  wsPlanned: 'திட்டமிடப்பட்டது',

  /* -------------------------------------------------------------- planned */
  wsNotAvailable: 'இன்னும் கிடைக்கவில்லை',
  wsPlannedBody:
    'இந்த தொகுதி கட்டம் {{phase}} க்கு திட்டமிடப்பட்டுள்ளது. பணியிட அமைப்பு முழுமையாக இருக்க இந்த வழிசெலுத்தல் உள்ளீடு உள்ளது — இங்கு எதுவும் போலியாக இல்லை, இன்னும் தரவு உருவாக்கப்படவோ சேமிக்கப்படவோ இல்லை.',
  wsPlannedCapabilities: 'இந்த தொகுதி என்ன செய்யும்',
  wsNoSimulation: 'போலி தரவு இல்லை, போலி வரலாறு இல்லை, வேலை செய்வதைப் போலக் காட்டும் முடக்கப்பட்ட கட்டுப்பாடுகள் இல்லை.',
  wsBackHome: 'முகப்பிற்குத் திரும்பு',
  wsBackToWorkspace: 'பணியிடத்திற்குத் திரும்பு',
  wsExploreInstead: 'அதற்குப் பதிலாக நாசா அறிவியலை ஆராயுங்கள்',

  /* ------------------------------------------------------------ explore */
  wsExploreEyebrow: 'நாசா அறிவியல் தொகுப்பு',
  wsExploreTitle: 'ஆராயுங்கள்',
  wsExploreBody:
    'பதினைந்து நாசா இடங்கள் முழுமையாகப் பாதுகாக்கப்பட்டுள்ளன: படங்கள், பூமி கண்காணிப்பு, பயணங்கள், சுற்றுப்பாதை கண்காணிப்பு மற்றும் மும்மொழி விண்வெளி உதவியாளர்.',

  /* ---------------------------------------------------------- not found */
  wsNotFoundTitle: 'இந்தப் பக்கம் இல்லை',
  wsNotFoundBody: 'இந்த முகவரி NOVA பணியிட இடத்திற்கோ Explore பக்கத்திற்கோ பொருந்தவில்லை.',

  /* -------------------------------------------------------------- areas */
  wsAreaChatDesc:
    'உண்மையான டோக்கன் ஸ்ட்ரீமிங், வரலாறு, தேடல், மறுபெயரிடல், காப்பகம் மற்றும் திட்டச் சூழல் கொண்ட ChatGPT தர உரையாடல்கள்.',
  wsAreaChatB1: 'நிறுத்தம், மீளுருவாக்கம் மற்றும் நகலெடுப்புடன் ஸ்ட்ரீமிங் பதில்கள்',
  wsAreaChatB2: 'உரையாடல் பட்டியல், தேடல், பொருத்துதல், காப்பகம் மற்றும் மீட்பு',

  wsAreaProjectsDesc: 'உரையாடல்கள், ஆவணங்கள் மற்றும் பணிகளை அதன் சொந்த வழிமுறைகளுடன் ஒரு திட்டத்தின் கீழ் ஒழுங்கமைக்கவும்.',
  wsAreaProjectsB1: 'ஒவ்வொரு பதிலுக்கும் திட்ட வழிமுறைகள் பயன்படும்',
  wsAreaProjectsB2: 'தொடர்புடைய உரையாடல்கள், ஆவணங்கள், பணிகள் ஒரே இடத்தில்',

  wsAreaDocumentsDesc: 'ஆவணங்களை உருவாக்கி, திருத்தி, ஏற்றுமதி செய்யுங்கள் — AI செயல்கள் உங்கள் உரையை ஒருபோதும் மேலெழுதாது.',
  wsAreaDocumentsB1: 'தானியங்கி சேமிப்பு, திருத்தங்கள் மற்றும் செயல்நீக்கம்',
  wsAreaDocumentsB2: 'சுருக்கம், மீள்எழுத்து, வரைவு மற்றும் ஏற்றுமதி',

  wsAreaWritingDesc: 'கட்டுரைகள், அறிக்கைகள், மின்னஞ்சல்கள் மற்றும் முன்மொழிவுகளுக்கான கவனம் செலுத்திய எழுத்துச் சூழல்.',
  wsAreaWritingB1: 'தொனி, நீளம் மற்றும் அமைப்புக் கட்டுப்பாடுகள்',
  wsAreaWritingB2: 'பரிந்துரைகளை ஏற்கவும், நிராகரிக்கவும் அல்லது செருகவும்',

  wsAreaResearchDesc: 'ஒரு ஆய்வுக் கேள்வியை வடிவமைத்து, கண்டுபிடிப்புகளைப் பதிவு செய்து, நீங்கள் கட்டுப்படுத்தும் மூலப் பட்டியலை வைத்திருங்கள்.',
  wsAreaResearchB1: 'ஒப்பீட்டு அட்டவணைகள் மற்றும் முக்கிய கண்டுபிடிப்புகள்',
  wsAreaResearchB2: 'மூலங்கள் பயனர் வழங்கியவை எனக் குறிக்கப்படும் — ஒருபோதும் கற்பனை செய்யப்படாது',

  wsAreaCodeDesc: 'குறியீட்டை விளக்குங்கள், உருவாக்குங்கள், மதிப்பாய்வு செய்யுங்கள், ஆவணப்படுத்துங்கள் — இயக்குவதாகப் போலியான கூற்று இல்லை.',
  wsAreaCodeB1: 'மொழி அறிந்த வடிவமைப்பு மற்றும் வேறுபாடுகள்',
  wsAreaCodeB2: 'குறியீடு இங்கு இயக்கப்படாது எனத் தெளிவாகக் கூறும்',

  wsAreaKnowledgeDesc: 'உங்கள் சொந்த கோப்புகளைப் பதிவேற்றி, உண்மையில் ஏற்றப்பட்டவை பற்றிக் கேளுங்கள்.',
  wsAreaKnowledgeB1: 'பயனருக்கு மட்டும் தனிப்பட்ட சேமிப்பு',
  wsAreaKnowledgeB2: 'உரை கோப்புகள் குறியிடப்படும்; மற்றவை மெட்டாடேட்டா மட்டும் எனக் குறிக்கப்படும்',

  wsAreaTasksDesc: 'வேலையைத் திட்டமிட்டுக் கண்காணியுங்கள், திட்டங்களுடன் இணையுங்கள், இலக்குகளை மதிப்பாய்வு செய்யக்கூடிய பணிப் பட்டியலாக மாற்றுங்கள்.',
  wsAreaTasksB1: 'நிலை, முன்னுரிமை மற்றும் இறுதித் தேதிகள்',
  wsAreaTasksB2: 'நீங்கள் அனுமதிக்கும் வரை AI திட்டங்கள் எதையும் எழாது',

  wsAreaSettingsDesc: 'தோற்றம், மொழி, உரையாடல், பணியிடம், அணுகல்தன்மை மற்றும் தரவுக் கட்டுப்பாடுகள்.',
  wsAreaSettingsB1: 'உண்மையில் செயல்படும் கட்டுப்பாடுகள் மட்டும்',
  wsAreaSettingsB2: 'உங்கள் எல்லா தரவையும் ஏற்றுமதி செய்து நீக்குங்கள்',

  wsAreaProfileDesc: 'உங்கள் கணக்கு, காட்சிப் பெயர் மற்றும் வெளியேறுதல் — தரவு ஏற்றுமதி மற்றும் நீக்கலுடன்.',
  wsAreaProfileB1: 'அமர்வு நிர்வாகத்துடன் பாதுகாப்பான உள்நுழைவு',
  wsAreaProfileB2: 'கோரிக்கையின் பேரில் கணக்கையும் தரவையும் நீக்குங்கள்',
};

export const workspaceCopy: Record<CopyLanguage, Copy> = { en, si, ta };
export type WorkspaceCopyKey = keyof typeof en;
