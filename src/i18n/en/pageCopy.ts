/**
 * Page framing copy for destinations that had no dedicated headings in the
 * legacy dictionary (asteroids, orbital tracking, EPIC, exoplanets, quiz,
 * simulator, assistant, saved).
 *
 * Each description states what the page actually shows and — where relevant —
 * that values are simulated or historical. No page claims live data it does not
 * have.
 */

export const pageCopyEn = {

    neoTitle: 'Near-Earth object explorer',
    neoDescription:
      'Every object in NASA NeoWs’ close-approach feed for the selected window, with distance in lunar distances, estimated diameter and relative velocity. A close approach is a normal orbital event.',
    issTitle: 'Orbital tracking',
    issDescription:
      'Position and ground track for the International Space Station and tracked satellites. When the upstream service is unreachable the tracker states that the orbit is propagated, not observed.',
    epicTitle: 'EPIC Earth',
    epicDescription:
      'Full-disc imagery of Earth captured by DSCOVR from the Sun–Earth L1 point, roughly 1.5 million kilometres from the planet. Imagery is published with a delay; it is not a real-time view.',
    exoTitle: 'Exoplanet laboratory',
    exoDescription:
      'Confirmed and candidate worlds from the NASA Exoplanet Archive, rendered as scale-correct comparative bodies. Visual size is illustrative; orbital and physical values come from the archive.',
    quizTitle: 'Space trivia',
    quizDescription:
      'Short, source-checked questions about missions, orbital mechanics and Earth observation. Explanations are shown after every answer so a wrong guess still teaches something.',
    launchTitle: 'Rocket launch simulator',
    launchDescription:
      'KSC Launch Complex 39B flight console. Every altitude, velocity and propellant value below is produced by the simulator’s physics model — it is not spacecraft telemetry.',
    assistantTitle: 'NOVA — mission control assistant',
    assistantDescription:
      'A grounded assistant for this platform’s NASA datasets. Answers are generated server-side with keys that never reach the browser, and the assistant is told to admit uncertainty instead of inventing values.',
    savedTitle: 'Saved research',
    savedDescription:
      'Astronomy pictures and mission dossiers you have bookmarked. Saved items live in this browser only; nothing is uploaded.',
    apodFallback:
      'NASA’s APOD service is unreachable right now. The archive below is cached or reference content and is labelled accordingly.'
  
};
