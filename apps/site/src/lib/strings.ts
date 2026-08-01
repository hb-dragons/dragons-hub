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
} as const;
