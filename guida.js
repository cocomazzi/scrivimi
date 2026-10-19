(() => {
  const root = document.getElementById('helpRoot');
  if (!root) return;
  const translations = [
    ['.kicker', ['DE HANDLEIDING BIJ SCRIVIMI!']],
    ['h1', ['Zo gebruik je Scrivimi!']],
    ['.help-lead', ['Schrijf in het Italiaans. Bereid je voor op een gesprek.']],
    ['.help-start a', ['▶ Begin met oefenen']],
    ['.help-article h2', ['<span>01</span> Gebruik je Italiaans actief', '<span>02</span> Vraag feedback op je teksten', '<span>03</span> Herhaal woorden en gebruik ze daarna']],
    ['.help-article p', [
      'In je eentje een taal oefenen is niet eenvoudig. Er zijn ontzettend veel bronnen om Italiaans te leren: artikelen, blogs, video’s, podcasts en films met ondertiteling. Deze bronnen zijn waardevol om je <strong>receptieve vaardigheden</strong> te ontwikkelen: lezen en luisteren. Maar je <strong>productieve vaardigheden</strong> oefenen, dus schrijven en spreken, is lastiger, vooral als je niemand hebt om mee te praten.',
      '<strong>Scrivimi! helpt je om je Italiaans actief te gebruiken door te schrijven.</strong> Het is een oefenschrift met begeleiding, opgebouwd uit leertrajecten die uitgaan van concrete communicatieve situaties: praten met familieleden, een vakantie organiseren, samenwerken met Italiaanse collega’s of een tweede huis in Italië beheren.',
      'Scrivimi! is bedoeld voor wie al een basiscursus Italiaans heeft gevolgd. Idealiter kun je de tegenwoordige tijd en de passato prossimo van regelmatige werkwoorden gebruiken, ken je de belangrijkste onregelmatige werkwoorden en kun je een volledige zin maken. Het is nog beter als je ook al een paar uur gesprekservaring hebt.',
      'De vragen en suggesties moedigen je aan om iets meer te schrijven dan je zonder begeleiding zou doen. Als je niemand hebt om mee te praten, <strong>is schrijven een van de doeltreffendste manieren om de taal te blijven gebruiken.</strong>',
      'Maar het doel blijft spreken. Daarom nodigen we je ook uit om <strong>enkele van je antwoorden in te spreken en op te nemen</strong>. Je kunt voorlezen wat je hebt geschreven of proberen het in je eigen woorden te vertellen.',
      'Scrivimi! corrigeert je teksten niet automatisch. Toch is feedback krijgen essentieel om vooruitgang te boeken.',
      'We raden je aan je antwoorden te kopiëren en een AI-assistent te vragen je fouten uit te leggen. Als je ze met een docent Italiaans kunt bespreken, is dat nog beter: het doel is immers spreken!',
      'Corrigeer deze Italiaanse tekst. Leg alleen de belangrijkste fouten uit, in eenvoudige woorden. Houd rekening met mijn taalniveau.',
      'Vergeet niet dat ook AI fouten kan maken.',
      'Voor zinnen die je niet begrijpt, kun je de ingebouwde vertaalfunctie van je browser gebruiken. Als je liever alleen geselecteerde tekst vertaalt, kun je een extensie proberen, zoals <a href="https://www.deepl.com/en/chrome-extension" target="_blank" rel="noopener noreferrer">DeepL</a>.',
      'Een ander belangrijk onderdeel is <a href="https://it.wikipedia.org/wiki/Ripetizione_dilazionata" target="_blank" rel="noopener noreferrer"><strong>gespreide herhaling</strong></a>: door op verschillende momenten terug te komen op wat je wilt leren, onthoud je het beter.',
      'In Scrivimi! kun je de woorden en uitdrukkingen die je wilt onthouden in je persoonlijke schrift bewaren. Je kunt ze vervolgens kopiëren met <strong>«Copia come TSV» (Kopiëren als TSV)</strong> of downloaden in een formaat dat geschikt is voor flashcard-apps.',
      'Wij hebben goede ervaringen met <a href="https://quizlet.com/" target="_blank" rel="noopener noreferrer">Quizlet</a>, <a href="https://studygo.com/" target="_blank" rel="noopener noreferrer">StudyGo</a> en, voor wie graag wat meer uitzoekt, <a href="https://apps.ankiweb.net/" target="_blank" rel="noopener noreferrer">Anki</a>.',
      'Maar losse woorden onthouden is pas de eerste stap. Wacht niet te lang om ze te gebruiken in volledige zinnen en in <a href="https://www.teachingenglish.org.uk/professional-development/teachers/teaching-knowledge-database/c/chunks" target="_blank" rel="noopener noreferrer"><strong>chunks</strong></a>: groepjes woorden die vaak samen voorkomen, zoals «Mi piacerebbe sapere…» (Ik zou graag willen weten…) of «Ci sentiamo la prossima settimana» (We spreken elkaar volgende week).',
      '<strong>En blijf vooral schrijven!</strong> Hoe vaker je de kans creëert om actief Italiaans te gebruiken, hoe gemakkelijker je de woorden terugvindt wanneer je ze in een gesprek nodig hebt.'
    ]],
    ['.help-prompt-head strong', ['Een voorbeeldprompt']],
    ['#copyHelpPrompt', ['Kopieer de prompt']]
  ];
  const entries = translations.flatMap(([selector, dutch]) =>
    [...root.querySelectorAll(selector)].map((element, index) => ({element, it: element.innerHTML, nl: dutch[index]})));
  let language = 'it';
  let revision = 0;
  const status = document.getElementById('helpCopyStatus');
  root.querySelectorAll('[data-guide-language]').forEach(button => {
    button.addEventListener('click', () => {
      language = button.dataset.guideLanguage;
      revision++;
      entries.forEach(entry => { entry.element.innerHTML = entry[language]; });
      root.lang = language;
      document.title = language === 'nl' ? 'Zo gebruik je Scrivimi!' : 'Come usare Scrivimi!';
      root.querySelectorAll('[data-guide-language]').forEach(control =>
        control.setAttribute('aria-pressed', String(control === button)));
      status.textContent = '';
    });
  });
  root.lang = 'it';
  document.getElementById('copyHelpPrompt').addEventListener('click', async () => {
    const currentRevision = revision;
    const text = document.getElementById('helpPromptText').textContent;
    try {
      await navigator.clipboard.writeText(text);
      if (revision === currentRevision) status.textContent = language === 'nl' ? 'Prompt gekopieerd.' : 'Prompt copiato.';
    } catch {
      if (revision === currentRevision) status.textContent = language === 'nl' ? 'Selecteer de tekst en kopieer deze handmatig.' : 'Seleziona il testo e copialo manualmente.';
    }
  });
})();
