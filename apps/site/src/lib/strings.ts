/**
 * Every user-facing literal on the public site lives here.
 * German only by design — the site has no i18n layer (plan: public-site
 * migration, Task C1). Add literals as pages get ported; never inline them.
 */
export const strings = {
  site: {
    name: "HB Dragons e.V.",
    logoAlt: "HB Dragons Logo",
    claim: {
      courtPart: "One Court, ",
      culturesPart: "United Cultures",
    },
  },
  nav: {
    home: "Home",
    news: "News",
    teams: "Teams",
    uberUns: "Über Uns",
    team: "Team",
    story: "Story",
    philosophie: "Philosophie",
    projekte: "Projekte",
    spielplan: "Spielplan",
    probetraining: "Probetraining",
    shop: "Shop",
    supporter: "Supporter",
    downloads: "Downloads",
    openMenu: "Menü öffnen",
    closeMenu: "Menü schließen",
  },
  footer: {
    clubName: "Hanover Basketball Dragons e.V.",
    email: "info@hbdragons.de",
    contactHeading: "Kontaktiere uns",
    datenschutzerklaerung: "Datenschutzerklärung",
    impressum: "Impressum",
    followHeading: "Folge uns",
    instagram: "Instagram",
    facebook: "Facebook",
    youtube: "YouTube",
    linkedin: "LinkedIn",
  },
  home: {
    scrollHint: "Scroll",
    newsHeading: "Aktuelle News",
    allNews: "Alle News",
    joinTitle: "Werde Teil unserer Familie",
    joinCta: "Probetraining vereinbaren",
    socialWallHeading: "Social Wall",
    statsMembers: "MITGLIEDER",
    statsTeams: "TEAMS",
    statsYears: "JAHRE DABEI",
  },
  nextGames: {
    heading: "Unsere nächsten Spiele",
    empty: "Keine Spiele geplant",
    // Kept distinct from `empty` on purpose (#257): an outage must not read
    // as "no games this week".
    loadError: "Die nächsten Spiele konnten nicht geladen werden. Bitte versuche es später erneut.",
    allGames: "Alle Spiele",
    versus: "VS",
  },
  notFound: {
    heading: "Seite nicht gefunden",
    message: "Diese Seite gibt es nicht (mehr) — vielleicht ein Tippfehler im Link, oder die Seite ist umgezogen.",
    backHome: "Zur Startseite",
  },
  spielplan: {
    heading: "Spielplan",
    filterAll: "Alle Spiele",
    filterHome: "Heimspiele",
    filterAway: "Auswärtsspiele",
    teamsFilter: "Teams",
    selectAll: "Alle auswählen",
    deselectAll: "Alle abwählen",
    exportLabel: "Excel Export",
    gamesCount: "Spiele",
    loadError: "Der Spielplan konnte nicht geladen werden. Bitte versuche es später erneut.",
    noGame: "Kein Spiel gefunden",
    mapAriaLabel: "Karte",
  },
  news: {
    fallbackHeading: "News",
    lightboxLabel: "Bild-Lightbox",
    lightboxClose: "Lightbox schließen",
    lightboxPrevious: "Vorheriges Bild",
    lightboxNext: "Nächstes Bild",
    lightboxOpen: "Bild im Lightbox ansehen",
  },
  shop: {
    heading: "Shop",
    buy: "Jetzt kaufen",
    buyAriaSuffix: "kaufen - öffnet in neuem Tab",
    noImage: "Kein Bild verfügbar",
    emptyTitle: "Keine Produkte verfügbar",
    emptyText: "Derzeit sind keine Produkte im Shop verfügbar.",
  },
  supporter: {
    fallbackHeading: "Supporter",
    heroTitle: "Werde Supporter unseres Vereins!",
    heroDescription:
      "Unser Verein steht für Integration, Zusammenhalt und soziales Miteinander - mit Basketball als Herzstück. Wir machen den Sport für alle zugänglich, bauen Barrieren ab und fördern Teilhabe. Um diese Arbeit fortzuführen und weiter auszubauen, sind starke Supporter an unserer Seite unverzichtbar.",
    listTitle: "Unsere Supporter",
    buttonLabel: "Zum Partner",
  },
  itemRows: {
    contactCta: "Kontaktiere uns",
    contactAria: "Kontakt per E-Mail aufnehmen",
  },
  downloads: {
    fallbackHeading: "Downloads",
    download: "Download",
    emptyTitle: "Keine Downloads verfügbar",
    emptyText: "Derzeit sind keine Dateien zum Download verfügbar.",
  },
  dragons: {
    philosophie: {
      heading: "Dragons Philosophie",
    },
    projekte: {
      heading: "Projekte",
      heroTitle: "Unsere Projekte",
      heroDescription:
        "Wir engagieren uns in verschiedenen Projekten, die über den Sport hinausgehen. Unsere Initiativen fördern Integration, Bildung und soziales Engagement in der Gemeinschaft. Entdecke unsere aktuellen Projekte und werde Teil unserer Mission.",
      listTitle: "Aktuelle Projekte",
      buttonLabel: "Zum Projektpartner",
    },
    story: {
      heading: "Dragons Story",
    },
    team: {
      heading: "Kontakt",
      vorstandHeading: "Unser Vorstand",
      positionsHeading: "Unsere Ehrenamtlichen",
      coachesHeading: "Unsere Coaches",
      refereesHeading: "Unsere Refs",
    },
  },
  comingSoon: {
    title: "Bald verfügbar",
    description:
      "Wir sind noch dabei, diese Seite zu erstellen. Schau später noch einmal vorbei.",
    backHome: "Zur Startseite",
  },
  impressum: {
    heading: "Impressum",
  },
  datenschutz: {
    heading: "Datenschutzerklärung",
  },
  kontoLoeschen: {
    heading: "Konto löschen",
  },
  probetraining: {
    fallbackHeading: "Probetraining",
    stepOneIntro:
      "Wir brauchen ein paar Informationen von dir, um das perfekte Probetraining für Dich zu organisieren",
    monthLabel: "Monat",
    yearLabel: "Jahr",
    genderLabel: "Geschlecht",
    genderPlaceholder: "Bitte wählen",
    didPlayQuestion: "Hast Du schon mal in einem Verein Basketball gespielt?",
    didPlayNo: "Nein",
    didPlayYes: "Ja",
    next: "Weiter",
    back: "Zurück",
    submit: "Absenden",
    summaryBirthdate: "Geburtsdatum",
    summaryDidPlay: "Schonmal im Verein gespielt",
    summaryEmail: "E-Mail",
    summaryMessage: "Nachricht",
    emailLabel: "Deine E-Mail über die wir dich erreichen können",
    messageLabel: "Nachricht an uns",
    privacyLabel: "Ich habe die Datenschutzerklärung gelesen und stimme zu",
    successHeading: "Danke für deine Anfrage! Wir werden uns schnellstmöglich um deine Anfrage kümmern.",
    successData: "Folgende Daten wurden an uns übermittelt:",
    backHome: "Zurück zur Startseite",
    errorTitle: "Fehler",
    errorMessage: "Es ist ein Fehler aufgetreten. Bitte versuche es erneut.",
    rateLimitedMessage: "Zu viele Anfragen. Bitte versuche es später erneut.",
    dismissError: "Schließen",
    // Honeypot label — never visible; bots fill labelled fields more eagerly.
    honeypotLabel: "Website",
    genderRequired: "Wird benötigt",
    emailInvalid: "Ungültige E-Mail",
    privacyRequired: "Du musst die Datenschutzerklärung akzeptieren",
    messageTooLong: "Die Nachricht darf höchstens 2000 Zeichen lang sein",
    stepAriaLabels: {
      info: "Schritt 1: Informationen",
      request: "Schritt 2: Anfrage",
      done: "Schritt 3: Bestätigung",
    },
  },
  teams: {
    heading: "Teams",
    goToTeam: "Zum Team",
    overlayTeam: "Team",
    coach: "Coach",
    trainerFallback: "Trainer",
    lastGame: "Letztes Spiel",
    nextGame: "Nächstes Spiel",
    tabGames: "Spielplan",
    tabStandings: "Tabelle",
    colDate: "Datum",
    colTime: "Uhrzeit",
    colHome: "Heim",
    colResult: "Ergebnis",
    colGuest: "Gast",
    colVenue: "Halle",
    colRank: "Rang",
    colName: "Name",
    colGames: "Spiele",
    colWins: "S",
    colLosses: "N",
    colPoints: "Punkte",
    colBaskets: "Körbe",
    teamsCount: "Teams",
    standingsError: "Fehler beim Laden",
    gamesLoadError: "Konnte nicht geladen werden. Bitte versuche es später erneut.",
  },
  scoreboard: {
    sectionLabel: "Live-Spielstand",
    liveBadge: "Live",
    home: "Heim",
    guest: "Gast",
    // Period prefix, same abbreviation the web scoreboard uses ("Q2").
    periodPrefix: "Q",
  },
  seo: {
    // Meta descriptions (Task C8). Per-doc CMS overrides win; these are the
    // hand-written fallbacks per route, kept inside the ~155-char budget.
    defaultDescription:
      "HB Dragons e.V. – Basketballverein aus Hannover. One Court, United Cultures: Teams für Damen, Herren und Jugend, News, Spielplan und Probetraining.",
    news: "Aktuelle News der HB Dragons: Spielberichte, Neuigkeiten und Geschichten aus dem Verein – Basketball in Hannover.",
    teams:
      "Alle Teams der HB Dragons im Überblick: Damen-, Herren- und Jugendmannschaften des Basketballvereins aus Hannover.",
    teamDescriptionTail:
      " bei den HB Dragons: Trainingszeiten, Trainer, Spielplan und Tabelle – Basketball in Hannover.",
    spielplan:
      "Der komplette Spielplan der HB Dragons: alle Heim- und Auswärtsspiele unserer Teams mit Terminen, Hallen und Ergebnissen.",
    shop: "Der offizielle Fanshop der HB Dragons: Trikots, Hoodies und mehr im Dragons-Design.",
    supporter:
      "Die Supporter der HB Dragons: Partner und Förderer, die Basketball und Integration in Hannover möglich machen.",
    downloads:
      "Downloads der HB Dragons: Formulare, Anträge und Dokumente rund um den Verein auf einen Blick.",
    philosophie:
      "Die Philosophie der HB Dragons: Integration, Zusammenhalt und Entwicklung durch Basketball – ein Verein für alle.",
    projekte:
      "Die Projekte der HB Dragons: Initiativen für Integration, Bildung und soziales Engagement in Hannover.",
    story:
      "Die Geschichte der HB Dragons: von der Gründung bis heute – alle Meilensteine unseres Vereins im Zeitstrahl.",
    kontakt:
      "Kontakt zu den HB Dragons: Vorstand, Ansprechpartner und Coaches des Basketballvereins aus Hannover.",
    impressum: "Impressum der HB Dragons e.V. mit allen Anbieterangaben gemäß § 5 DDG.",
    datenschutz:
      "Datenschutzerklärung der HB Dragons e.V.: Informationen zur Verarbeitung personenbezogener Daten auf dieser Website.",
    kontoLoeschen:
      "So beantragen Mitglieder die Löschung ihres Kontos in der Dragons App: per Mail an die Datenschutz-Adresse oder direkt aus der App.",
    notFound:
      "Diese Seite gibt es bei den HB Dragons nicht (mehr). Zurück zur Startseite des Basketballvereins aus Hannover.",
    probetraining:
      "Probetraining bei den HB Dragons vereinbaren: Komm vorbei und lerne unsere Teams in Hannover kennen – kostenlos und unverbindlich.",
  },
} as const;
