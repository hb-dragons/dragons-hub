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
    dragons: "Dragons",
    impressum: "Impressum",
    datenschutz: "Datenschutz",
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
    title: "HB Dragons e.V. — Startseite",
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
    allGames: "Alle Spiele",
    versus: "VS",
  },
  notFound: {
    title: "Seite nicht gefunden — HB Dragons e.V.",
    code: "404",
    heading: "Seite nicht gefunden",
    message: "Diese Seite gibt es nicht (mehr) — vielleicht ein Tippfehler im Link, oder die Seite ist umgezogen.",
    backHome: "Zur Startseite",
  },
  spielplan: {
    pageTitle: "Spielplan — HB Dragons e.V.",
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
    pageTitle: "News — HB Dragons e.V.",
    fallbackHeading: "News",
    titleSuffix: " — HB Dragons e.V.",
    lightboxLabel: "Bild-Lightbox",
    lightboxClose: "Lightbox schließen",
    lightboxPrevious: "Vorheriges Bild",
    lightboxNext: "Nächstes Bild",
    lightboxOpen: "Bild im Lightbox ansehen",
  },
  shop: {
    pageTitle: "Shop — HB Dragons e.V.",
    heading: "Shop",
    buy: "Jetzt kaufen",
    buyAriaSuffix: "kaufen - öffnet in neuem Tab",
    noImage: "Kein Bild verfügbar",
    emptyTitle: "Keine Produkte verfügbar",
    emptyText: "Derzeit sind keine Produkte im Shop verfügbar.",
  },
  supporter: {
    pageTitle: "Supporter — HB Dragons e.V.",
    fallbackHeading: "Supporter",
    heroTitle: "Werde Supporter unseres Vereins!",
    heroDescription:
      "Unser Verein steht für Integration, Zusammenhalt und soziales Miteinander - mit Basketball als Herzstück. Wir machen den Sport für alle zugänglich, bauen Barrieren ab und fördern Teilhabe. Um diese Arbeit fortzuführen und weiter auszubauen, sind starke Suppoerter an unserer Seite unverzichtbar.",
    listTitle: "Unsere Supporter",
    buttonLabel: "Zum Partner",
  },
  itemRows: {
    contactCta: "Kontaktiere uns",
    contactAria: "Kontakt per E-Mail aufnehmen",
  },
  downloads: {
    pageTitle: "Downloads — HB Dragons e.V.",
    fallbackHeading: "Downloads",
    download: "Download",
    emptyTitle: "Keine Downloads verfügbar",
    emptyText: "Derzeit sind keine Dateien zum Download verfügbar.",
  },
  dragons: {
    philosophie: {
      pageTitle: "Philosophie — HB Dragons e.V.",
      heading: "Dragons Philosophie",
    },
    projekte: {
      pageTitle: "Projekte — HB Dragons e.V.",
      heading: "Projekte",
      heroTitle: "Unsere Projekte",
      heroDescription:
        "Wir engagieren uns in verschiedenen Projekten, die über den Sport hinausgehen. Unsere Initiativen fördern Integration, Bildung und soziales Engagement in der Gemeinschaft. Entdecken Sie unsere aktuellen Projekte und werden Sie Teil unserer Mission.",
      listTitle: "Aktuelle Projekte",
      buttonLabel: "Zum Projektpartner",
    },
    story: {
      pageTitle: "Story — HB Dragons e.V.",
      heading: "Dragons Story",
    },
    team: {
      pageTitle: "Kontakt — HB Dragons e.V.",
      heading: "Kontakt",
      vorstandHeading: "Unser Vorstand",
      positionsHeading: "Unsere Ehrenamtlichen",
      coachesHeading: "Unsere Coaches",
    },
  },
  comingSoon: {
    title: "Coming soon",
    description:
      "Wir sind noch dabei, diese Seite zu erstellen. Bitte schauen Sie später noch einmal vorbei.",
    backHome: "Zur Startseite",
  },
  impressum: {
    pageTitle: "Impressum — HB Dragons e.V.",
    heading: "Impressum",
  },
  datenschutz: {
    pageTitle: "Datenschutzerklärung — HB Dragons e.V.",
    heading: "Datenschutzerklärung",
  },
  teams: {
    pageTitle: "Teams — HB Dragons e.V.",
    heading: "Teams",
    titleSuffix: " — HB Dragons e.V.",
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
    impressum: "Impressum der HB Dragons e.V. mit allen Anbieterangaben gemäß § 5 TMG.",
    datenschutz:
      "Datenschutzerklärung der HB Dragons e.V.: Informationen zur Verarbeitung personenbezogener Daten auf dieser Website.",
    notFound:
      "Diese Seite gibt es bei den HB Dragons nicht (mehr). Zurück zur Startseite des Basketballvereins aus Hannover.",
  },
} as const;
