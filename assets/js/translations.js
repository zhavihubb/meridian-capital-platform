/* ============================================================
   MERIDIAN CAPITAL PARTNERS — TRANSLATIONS (10 languages)
   LANGS: en, fr, it, es, de, pt, ar, zh, ru, hi
   Applies to elements carrying data-i18n="key".
   ============================================================ */
(function (global) {
  "use strict";

  var LANGS = [
    { code: "en", name: "English", flag: "\uD83C\uDDEC\uD83C\uDDE7" },
    { code: "fr", name: "Fran\u00E7ais", flag: "\uD83C\uDDEB\uD83C\uDDF7" },
    { code: "it", name: "Italiano", flag: "\uD83C\uDDEE\uD83C\uDDF9" },
    { code: "es", name: "Espa\u00F1ol", flag: "\uD83C\uDDEA\uD83C\uDDF8" },
    { code: "de", name: "Deutsch", flag: "\uD83C\uDDE9\uD83C\uDDEA" },
    { code: "pt", name: "Portugu\u00EAs", flag: "\uD83C\uDDF5\uD83C\uDDF9" },
    { code: "ar", name: "\u0627\u0644\u0639\u0631\u0628\u064A\u0629", flag: "\uD83C\uDDF8\uD83C\uDDE6" },
    { code: "zh", name: "\u4E2D\u6587", flag: "\uD83C\uDDE8\uD83C\uDDF3" },
    { code: "ru", name: "\u0420\u0443\u0441\u0441\u043A\u0438\u0439", flag: "\uD83C\uDDF7\uD83C\uDDFA" },
    { code: "hi", name: "\u0939\u093F\u0928\u094D\u0926\u0940", flag: "\uD83C\uDDEE\uD83C\uDDF3" }
  ];

  var I18N = {
    en: {
      "nav.home": "Home", "nav.markets": "Markets", "nav.loans": "Loans",
      "nav.portfolios": "Portfolios", "nav.about": "About", "nav.legal": "Legal",
      "cta.signin": "Sign In", "cta.create": "Create Account",
      "hero.eyebrow": "\uD83C\uDDEC\uD83C\uDDE7 UK-Based \u00B7 FCA-Aligned Standards",
      "hero.title": "Invest With Confidence, From the Heart of London",
      "hero.lead": "Access UK and global investment opportunities with a regulated, transparent platform built for British investors \u2014 and open to the world.",
      "hero.cta1": "Create Account", "hero.cta2": "Explore Investments",
      "stat.assets": "Asset Classes", "stat.langs": "Languages Supported",
      "stat.min": "Minimum First Deposit", "stat.support": "Multilingual Support",
      "sec.services.kicker": "Investment Marketplace",
      "sec.services.title": "Everything You Need to Build Wealth",
      "sec.services.sub": "From UK equities to global cryptoassets \u2014 all in one regulated platform.",
      "sec.process.kicker": "Getting Started", "sec.process.title": "How It Works",
      "sec.contact.title": "Get In Touch",
      "footer.rights": "All rights reserved."
    },
    fr: {
      "nav.home": "Accueil", "nav.markets": "March\u00E9s", "nav.loans": "Pr\u00EAts",
      "nav.portfolios": "Portefeuilles", "nav.about": "\u00C0 propos", "nav.legal": "Mentions l\u00E9gales",
      "cta.signin": "Connexion", "cta.create": "Cr\u00E9er un compte",
      "hero.eyebrow": "\uD83C\uDDEC\uD83C\uDDE7 Bas\u00E9 au Royaume-Uni \u00B7 Normes align\u00E9es FCA",
      "hero.title": "Investissez en confiance, au c\u0153ur de Londres",
      "hero.lead": "Acc\u00E9dez aux opportunit\u00E9s d'investissement britanniques et mondiales gr\u00E2ce \u00E0 une plateforme r\u00E9glement\u00E9e et transparente, con\u00E7ue pour les investisseurs britanniques \u2014 et ouverte au monde.",
      "hero.cta1": "Cr\u00E9er un compte", "hero.cta2": "Explorer les investissements",
      "stat.assets": "Classes d'actifs", "stat.langs": "Langues prises en charge",
      "stat.min": "D\u00E9p\u00F4t initial minimum", "stat.support": "Support multilingue",
      "sec.services.kicker": "March\u00E9 d'investissement",
      "sec.services.title": "Tout ce qu'il faut pour b\u00E2tir votre patrimoine",
      "sec.services.sub": "Des actions britanniques aux cryptoactifs mondiaux \u2014 sur une seule plateforme r\u00E9glement\u00E9e.",
      "sec.process.kicker": "Pour commencer", "sec.process.title": "Comment \u00E7a marche",
      "sec.contact.title": "Nous contacter",
      "footer.rights": "Tous droits r\u00E9serv\u00E9s."
    },
    it: {
      "nav.home": "Home", "nav.markets": "Mercati", "nav.loans": "Prestiti",
      "nav.portfolios": "Portafogli", "nav.about": "Chi siamo", "nav.legal": "Note legali",
      "cta.signin": "Accedi", "cta.create": "Crea account",
      "hero.eyebrow": "\uD83C\uDDEC\uD83C\uDDE7 Con sede nel Regno Unito \u00B7 Standard allineati FCA",
      "hero.title": "Investi con fiducia, dal cuore di Londra",
      "hero.lead": "Accedi a opportunit\u00E0 di investimento britanniche e globali con una piattaforma regolamentata e trasparente, pensata per gli investitori britannici \u2014 e aperta al mondo.",
      "hero.cta1": "Crea account", "hero.cta2": "Esplora gli investimenti",
      "stat.assets": "Classi di attivit\u00E0", "stat.langs": "Lingue supportate",
      "stat.min": "Deposito iniziale minimo", "stat.support": "Supporto multilingue",
      "sec.services.kicker": "Mercato degli investimenti",
      "sec.services.title": "Tutto ci\u00F2 che serve per costruire ricchezza",
      "sec.services.sub": "Dalle azioni britanniche ai cryptoasset globali \u2014 tutto su un'unica piattaforma regolamentata.",
      "sec.process.kicker": "Per iniziare", "sec.process.title": "Come funziona",
      "sec.contact.title": "Contattaci",
      "footer.rights": "Tutti i diritti riservati."
    },
    es: {
      "nav.home": "Inicio", "nav.markets": "Mercados", "nav.loans": "Pr\u00E9stamos",
      "nav.portfolios": "Carteras", "nav.about": "Nosotros", "nav.legal": "Legal",
      "cta.signin": "Iniciar sesi\u00F3n", "cta.create": "Crear cuenta",
      "hero.eyebrow": "\uD83C\uDDEC\uD83C\uDDE7 Con sede en el Reino Unido \u00B7 Est\u00E1ndares alineados con la FCA",
      "hero.title": "Invierte con confianza, desde el coraz\u00F3n de Londres",
      "hero.lead": "Accede a oportunidades de inversi\u00F3n brit\u00E1nicas y globales con una plataforma regulada y transparente, dise\u00F1ada para inversores brit\u00E1nicos \u2014 y abierta al mundo.",
      "hero.cta1": "Crear cuenta", "hero.cta2": "Explorar inversiones",
      "stat.assets": "Clases de activos", "stat.langs": "Idiomas admitidos",
      "stat.min": "Dep\u00F3sito inicial m\u00EDnimo", "stat.support": "Soporte multiling\u00FCe",
      "sec.services.kicker": "Mercado de inversi\u00F3n",
      "sec.services.title": "Todo lo que necesitas para crear riqueza",
      "sec.services.sub": "Desde acciones brit\u00E1nicas hasta criptoactivos globales \u2014 todo en una plataforma regulada.",
      "sec.process.kicker": "Para empezar", "sec.process.title": "C\u00F3mo funciona",
      "sec.contact.title": "Ponte en contacto",
      "footer.rights": "Todos los derechos reservados."
    },
    de: {
      "nav.home": "Startseite", "nav.markets": "M\u00E4rkte", "nav.loans": "Kredite",
      "nav.portfolios": "Portfolios", "nav.about": "\u00DCber uns", "nav.legal": "Rechtliches",
      "cta.signin": "Anmelden", "cta.create": "Konto erstellen",
      "hero.eyebrow": "\uD83C\uDDEC\uD83C\uDDE7 Sitz im Vereinigten K\u00F6nigreich \u00B7 FCA-konforme Standards",
      "hero.title": "Investieren Sie mit Vertrauen, aus dem Herzen Londons",
      "hero.lead": "Erhalten Sie Zugang zu britischen und globalen Anlagem\u00F6glichkeiten \u00FCber eine regulierte, transparente Plattform \u2014 f\u00FCr britische Anleger und die ganze Welt.",
      "hero.cta1": "Konto erstellen", "hero.cta2": "Anlagen entdecken",
      "stat.assets": "Anlageklassen", "stat.langs": "Unterst\u00FCtzte Sprachen",
      "stat.min": "Mindestersteinzahlung", "stat.support": "Mehrsprachiger Support",
      "sec.services.kicker": "Anlagemarktplatz",
      "sec.services.title": "Alles, was Sie zum Verm\u00F6gensaufbau brauchen",
      "sec.services.sub": "Von britischen Aktien bis zu globalen Kryptoanlagen \u2014 alles auf einer regulierten Plattform.",
      "sec.process.kicker": "Erste Schritte", "sec.process.title": "So funktioniert es",
      "sec.contact.title": "Kontakt aufnehmen",
      "footer.rights": "Alle Rechte vorbehalten."
    },
    pt: {
      "nav.home": "In\u00EDcio", "nav.markets": "Mercados", "nav.loans": "Empr\u00E9stimos",
      "nav.portfolios": "Carteiras", "nav.about": "Sobre", "nav.legal": "Legal",
      "cta.signin": "Entrar", "cta.create": "Criar conta",
      "hero.eyebrow": "\uD83C\uDDEC\uD83C\uDDE7 Sediada no Reino Unido \u00B7 Padr\u00F5es alinhados \u00E0 FCA",
      "hero.title": "Invista com confian\u00E7a, do cora\u00E7\u00E3o de Londres",
      "hero.lead": "Aceda a oportunidades de investimento brit\u00E2nicas e globais com uma plataforma regulada e transparente, criada para investidores brit\u00E2nicos \u2014 e aberta ao mundo.",
      "hero.cta1": "Criar conta", "hero.cta2": "Explorar investimentos",
      "stat.assets": "Classes de ativos", "stat.langs": "Idiomas suportados",
      "stat.min": "Dep\u00F3sito inicial m\u00EDnimo", "stat.support": "Suporte multilingue",
      "sec.services.kicker": "Mercado de investimento",
      "sec.services.title": "Tudo o que precisa para construir riqueza",
      "sec.services.sub": "De a\u00E7\u00F5es brit\u00E2nicas a criptoativos globais \u2014 tudo numa plataforma regulada.",
      "sec.process.kicker": "Para come\u00E7ar", "sec.process.title": "Como funciona",
      "sec.contact.title": "Entre em contacto",
      "footer.rights": "Todos os direitos reservados."
    },
    ar: {
      "nav.home": "\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629", "nav.markets": "\u0627\u0644\u0623\u0633\u0648\u0627\u0642", "nav.loans": "\u0627\u0644\u0642\u0631\u0648\u0636",
      "nav.portfolios": "\u0627\u0644\u0645\u062D\u0627\u0641\u0638", "nav.about": "\u0645\u0646 \u0646\u062D\u0646", "nav.legal": "\u0642\u0627\u0646\u0648\u0646\u064A",
      "cta.signin": "\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644", "cta.create": "\u0625\u0646\u0634\u0627\u0621 \u062D\u0633\u0627\u0628",
      "hero.eyebrow": "\uD83C\uDDEC\uD83C\uDDE7 \u0645\u0642\u0631\u0647\u0627 \u0627\u0644\u0645\u0645\u0644\u0643\u0629 \u0627\u0644\u0645\u062A\u062D\u062F\u0629 \u00B7 \u0645\u0639\u0627\u064A\u064A\u0631 \u0645\u062A\u0648\u0627\u0641\u0642\u0629 \u0645\u0639 FCA",
      "hero.title": "\u0627\u0633\u062A\u062B\u0645\u0631 \u0628\u062B\u0642\u0629\u060C \u0645\u0646 \u0642\u0644\u0628 \u0644\u0646\u062F\u0646",
      "hero.lead": "\u0627\u062D\u0635\u0644 \u0639\u0644\u0649 \u0641\u0631\u0635 \u0627\u0633\u062A\u062B\u0645\u0627\u0631\u064A\u0629 \u0628\u0631\u064A\u0637\u0627\u0646\u064A\u0629 \u0648\u0639\u0627\u0644\u0645\u064A\u0629 \u0639\u0628\u0631 \u0645\u0646\u0635\u0629 \u0645\u0646\u0638\u0645\u0629 \u0648\u0634\u0641\u0627\u0641\u0629.",
      "hero.cta1": "\u0625\u0646\u0634\u0627\u0621 \u062D\u0633\u0627\u0628", "hero.cta2": "\u0627\u0633\u062A\u0643\u0634\u0641 \u0627\u0644\u0627\u0633\u062A\u062B\u0645\u0627\u0631\u0627\u062A",
      "stat.assets": "\u0641\u0626\u0627\u062A \u0627\u0644\u0623\u0635\u0648\u0644", "stat.langs": "\u0627\u0644\u0644\u063A\u0627\u062A \u0627\u0644\u0645\u062F\u0639\u0648\u0645\u0629",
      "stat.min": "\u0627\u0644\u062D\u062F \u0627\u0644\u0623\u062F\u0646\u0649 \u0644\u0644\u0625\u064A\u062F\u0627\u0639", "stat.support": "\u062F\u0639\u0645 \u0645\u062A\u0639\u062F\u062F \u0627\u0644\u0644\u063A\u0627\u062A",
      "sec.services.kicker": "\u0633\u0648\u0642 \u0627\u0644\u0627\u0633\u062A\u062B\u0645\u0627\u0631",
      "sec.services.title": "\u0643\u0644 \u0645\u0627 \u062A\u062D\u062A\u0627\u062C\u0647 \u0644\u0628\u0646\u0627\u0621 \u0627\u0644\u062B\u0631\u0648\u0629",
      "sec.services.sub": "\u0645\u0646 \u0627\u0644\u0623\u0633\u0647\u0645 \u0627\u0644\u0628\u0631\u064A\u0637\u0627\u0646\u064A\u0629 \u0625\u0644\u0649 \u0627\u0644\u0623\u0635\u0648\u0644 \u0627\u0644\u0631\u0642\u0645\u064A\u0629 \u0627\u0644\u0639\u0627\u0644\u0645\u064A\u0629.",
      "sec.process.kicker": "\u0627\u0644\u0628\u062F\u0621", "sec.process.title": "\u0643\u064A\u0641 \u064A\u0639\u0645\u0644",
      "sec.contact.title": "\u062A\u0648\u0627\u0635\u0644 \u0645\u0639\u0646\u0627",
      "footer.rights": "\u062C\u0645\u064A\u0639 \u0627\u0644\u062D\u0642\u0648\u0642 \u0645\u062D\u0641\u0648\u0638\u0629."
    },
    zh: {
      "nav.home": "\u9996\u9875", "nav.markets": "\u5E02\u573A", "nav.loans": "\u8D37\u6B3E",
      "nav.portfolios": "\u6295\u8D44\u7EC4\u5408", "nav.about": "\u5173\u4E8E\u6211\u4EEC", "nav.legal": "\u6CD5\u5F8B",
      "cta.signin": "\u767B\u5F55", "cta.create": "\u521B\u5EFA\u8D26\u6237",
      "hero.eyebrow": "\uD83C\uDDEC\uD83C\uDDE7 \u603B\u90E8\u4F4D\u4E8E\u82F1\u56FD \u00B7 \u7B26\u5408 FCA \u6807\u51C6",
      "hero.title": "\u4ECE\u4F26\u6566\u4E2D\u5FC3\uFF0C\u4FE1\u5FC3\u6295\u8D44",
      "hero.lead": "\u901A\u8FC7\u53D7\u76D1\u7BA1\u3001\u900F\u660E\u7684\u5E73\u53F0\uFF0C\u83B7\u53D6\u82F1\u56FD\u53CA\u5168\u7403\u6295\u8D44\u673A\u4F1A\u3002",
      "hero.cta1": "\u521B\u5EFA\u8D26\u6237", "hero.cta2": "\u63A2\u7D22\u6295\u8D44",
      "stat.assets": "\u8D44\u4EA7\u7C7B\u522B", "stat.langs": "\u652F\u6301\u8BED\u8A00",
      "stat.min": "\u6700\u4F4E\u9996\u6B21\u5B58\u6B3E", "stat.support": "\u591A\u8BED\u8A00\u652F\u6301",
      "sec.services.kicker": "\u6295\u8D44\u5E02\u573A",
      "sec.services.title": "\u6784\u5EFA\u8D22\u5BCC\u6240\u9700\u7684\u4E00\u5207",
      "sec.services.sub": "\u4ECE\u82F1\u56FD\u80A1\u7968\u5230\u5168\u7403\u52A0\u5BC6\u8D44\u4EA7\u2014\u2014\u5C3D\u5728\u4E00\u4E2A\u53D7\u76D1\u7BA1\u7684\u5E73\u53F0\u3002",
      "sec.process.kicker": "\u5F00\u59CB\u4F7F\u7528", "sec.process.title": "\u5982\u4F55\u8FD0\u4F5C",
      "sec.contact.title": "\u8054\u7CFB\u6211\u4EEC",
      "footer.rights": "\u4FDD\u7559\u6240\u6709\u6743\u5229\u3002"
    },
    ru: {
      "nav.home": "\u0413\u043B\u0430\u0432\u043D\u0430\u044F", "nav.markets": "\u0420\u044B\u043D\u043A\u0438", "nav.loans": "\u041A\u0440\u0435\u0434\u0438\u0442\u044B",
      "nav.portfolios": "\u041F\u043E\u0440\u0442\u0444\u0435\u043B\u0438", "nav.about": "\u041E \u043D\u0430\u0441", "nav.legal": "\u041F\u0440\u0430\u0432\u043E\u0432\u0430\u044F \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044F",
      "cta.signin": "\u0412\u043E\u0439\u0442\u0438", "cta.create": "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0430\u043A\u043A\u0430\u0443\u043D\u0442",
      "hero.eyebrow": "\uD83C\uDDEC\uD83C\uDDE7 \u0428\u0442\u0430\u0431-\u043A\u0432\u0430\u0440\u0442\u0438\u0440\u0430 \u0432 \u0412\u0435\u043B\u0438\u043A\u043E\u0431\u0440\u0438\u0442\u0430\u043D\u0438\u0438 \u00B7 \u0421\u0442\u0430\u043D\u0434\u0430\u0440\u0442\u044B FCA",
      "hero.title": "\u0418\u043D\u0432\u0435\u0441\u0442\u0438\u0440\u0443\u0439\u0442\u0435 \u0441 \u0443\u0432\u0435\u0440\u0435\u043D\u043D\u043E\u0441\u0442\u044C\u044E, \u0438\u0437 \u0441\u0435\u0440\u0434\u0446\u0430 \u041B\u043E\u043D\u0434\u043E\u043D\u0430",
      "hero.lead": "\u0414\u043E\u0441\u0442\u0443\u043F \u043A \u0431\u0440\u0438\u0442\u0430\u043D\u0441\u043A\u0438\u043C \u0438 \u0433\u043B\u043E\u0431\u0430\u043B\u044C\u043D\u044B\u043C \u0438\u043D\u0432\u0435\u0441\u0442\u0438\u0446\u0438\u044F\u043C \u0447\u0435\u0440\u0435\u0437 \u0440\u0435\u0433\u0443\u043B\u0438\u0440\u0443\u0435\u043C\u0443\u044E \u043F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0443.",
      "hero.cta1": "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0430\u043A\u043A\u0430\u0443\u043D\u0442", "hero.cta2": "\u0418\u0437\u0443\u0447\u0438\u0442\u044C \u0438\u043D\u0432\u0435\u0441\u0442\u0438\u0446\u0438\u0438",
      "stat.assets": "\u041A\u043B\u0430\u0441\u0441\u044B \u0430\u043A\u0442\u0438\u0432\u043E\u0432", "stat.langs": "\u041F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u043C\u044B\u0435 \u044F\u0437\u044B\u043A\u0438",
      "stat.min": "\u041C\u0438\u043D\u0438\u043C\u0430\u043B\u044C\u043D\u044B\u0439 \u043F\u0435\u0440\u0432\u044B\u0439 \u0434\u0435\u043F\u043E\u0437\u0438\u0442", "stat.support": "\u041C\u043D\u043E\u0433\u043E\u044F\u0437\u044B\u0447\u043D\u0430\u044F \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0430",
      "sec.services.kicker": "\u0418\u043D\u0432\u0435\u0441\u0442\u0438\u0446\u0438\u043E\u043D\u043D\u044B\u0439 \u0440\u044B\u043D\u043E\u043A",
      "sec.services.title": "\u0412\u0441\u0451 \u0434\u043B\u044F \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F \u043A\u0430\u043F\u0438\u0442\u0430\u043B\u0430",
      "sec.services.sub": "\u041E\u0442 \u0431\u0440\u0438\u0442\u0430\u043D\u0441\u043A\u0438\u0445 \u0430\u043A\u0446\u0438\u0439 \u0434\u043E \u0433\u043B\u043E\u0431\u0430\u043B\u044C\u043D\u044B\u0445 \u043A\u0440\u0438\u043F\u0442\u043E\u0430\u043A\u0442\u0438\u0432\u043E\u0432.",
      "sec.process.kicker": "\u041D\u0430\u0447\u0430\u043B\u043E \u0440\u0430\u0431\u043E\u0442\u044B", "sec.process.title": "\u041A\u0430\u043A \u044D\u0442\u043E \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442",
      "sec.contact.title": "\u0421\u0432\u044F\u0436\u0438\u0442\u0435\u0441\u044C \u0441 \u043D\u0430\u043C\u0438",
      "footer.rights": "\u0412\u0441\u0435 \u043F\u0440\u0430\u0432\u0430 \u0437\u0430\u0449\u0438\u0449\u0435\u043D\u044B."
    },
    hi: {
      "nav.home": "\u0939\u094B\u092E", "nav.markets": "\u092C\u093E\u091C\u093E\u0930", "nav.loans": "\u090B\u0923",
      "nav.portfolios": "\u092A\u094B\u0930\u094D\u091F\u092B\u094B\u0932\u093F\u092F\u094B", "nav.about": "\u0939\u092E\u093E\u0930\u0947 \u092C\u093E\u0930\u0947 \u092E\u0947\u0902", "nav.legal": "\u0915\u093E\u0928\u0942\u0928\u0940",
      "cta.signin": "\u0938\u093E\u0907\u0928 \u0907\u0928", "cta.create": "\u0916\u093E\u0924\u093E \u092C\u0928\u093E\u090F\u0902",
      "hero.eyebrow": "\uD83C\uDDEC\uD83C\uDDE7 \u092F\u0942\u0915\u0947 \u0938\u094D\u0925\u093F\u0924 \u00B7 FCA-\u0938\u0902\u0930\u0947\u0916\u093F\u0924 \u092E\u093E\u0928\u0915",
      "hero.title": "\u0932\u0902\u0926\u0928 \u0915\u0947 \u0926\u093F\u0932 \u0938\u0947, \u092D\u0930\u094B\u0938\u0947 \u0915\u0947 \u0938\u093E\u0925 \u0928\u093F\u0935\u0947\u0936 \u0915\u0930\u0947\u0902",
      "hero.lead": "\u090F\u0915 \u0928\u093F\u092F\u0902\u0924\u094D\u0930\u093F\u0924, \u092A\u093E\u0930\u0926\u0930\u094D\u0936\u0940 \u092A\u094D\u0932\u0947\u091F\u092B\u0949\u0930\u094D\u092E \u0915\u0947 \u0938\u093E\u0925 \u092F\u0942\u0915\u0947 \u0914\u0930 \u0935\u0948\u0936\u094D\u0935\u093F\u0915 \u0928\u093F\u0935\u0947\u0936 \u0905\u0935\u0938\u0930\u094B\u0902 \u0924\u0915 \u092A\u0939\u0941\u0902\u091A\u0947\u0902\u0964",
      "hero.cta1": "\u0916\u093E\u0924\u093E \u092C\u0928\u093E\u090F\u0902", "hero.cta2": "\u0928\u093F\u0935\u0947\u0936 \u0926\u0947\u0916\u0947\u0902",
      "stat.assets": "\u090F\u0938\u0947\u091F \u0936\u094D\u0930\u0947\u0923\u093F\u092F\u093E\u0902", "stat.langs": "\u0938\u092E\u0930\u094D\u0925\u093F\u0924 \u092D\u093E\u0937\u093E\u090F\u0902",
      "stat.min": "\u0928\u094D\u092F\u0942\u0928\u0924\u092E \u092A\u0939\u0932\u093E \u091C\u092E\u093E", "stat.support": "\u092C\u0939\u0941\u092D\u093E\u0937\u0940 \u0938\u092E\u0930\u094D\u0925\u0928",
      "sec.services.kicker": "\u0928\u093F\u0935\u0947\u0936 \u092C\u093E\u091C\u093E\u0930",
      "sec.services.title": "\u0938\u0902\u092A\u0924\u094D\u0924\u093F \u092C\u0928\u093E\u0928\u0947 \u0915\u0947 \u0932\u093F\u090F \u0938\u092C \u0915\u0941\u091B",
      "sec.services.sub": "\u092F\u0942\u0915\u0947 \u0936\u0947\u092F\u0930\u094B\u0902 \u0938\u0947 \u0932\u0947\u0915\u0930 \u0935\u0948\u0936\u094D\u0935\u093F\u0915 \u0915\u094D\u0930\u093F\u092A\u094D\u091F\u094B \u0924\u0915\u0964",
      "sec.process.kicker": "\u0936\u0941\u0930\u0942 \u0915\u0930\u0947\u0902", "sec.process.title": "\u092F\u0939 \u0915\u0948\u0938\u0947 \u0915\u093E\u092E \u0915\u0930\u0924\u093E \u0939\u0948",
      "sec.contact.title": "\u0938\u0902\u092A\u0930\u094D\u0915 \u0915\u0930\u0947\u0902",
      "footer.rights": "\u0938\u092D\u0940 \u0905\u0927\u093F\u0915\u093E\u0930 \u0938\u0941\u0930\u0915\u094D\u0937\u093F\u0924\u0964"
    }
  };

  var current = "en";

  function apply(lang) {
    if (!I18N[lang]) lang = "en";
    current = lang;
    try { localStorage.setItem("meridian_capital_lang", lang); } catch (e) {}
    document.documentElement.lang = lang === "en" ? "en-GB" : lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute("data-i18n");
      var val = (I18N[lang] && I18N[lang][key]) || (I18N.en[key]);
      if (val != null) nodes[i].textContent = val;
    }
    var sel = document.getElementById("langSelect");
    if (sel) sel.value = lang;
  }

  function init() {
    var saved = "en";
    try { saved = localStorage.getItem("meridian_capital_lang") || "en"; } catch (e) {}
    var sel = document.getElementById("langSelect");
    if (sel) {
      sel.innerHTML = "";
      LANGS.forEach(function (l) {
        var o = document.createElement("option");
        o.value = l.code; o.textContent = l.flag + " " + l.name;
        sel.appendChild(o);
      });
      sel.value = saved;
      sel.addEventListener("change", function () { apply(sel.value); });
    }
    apply(saved);
  }

  global.EV_I18N = { LANGS: LANGS, I18N: I18N, apply: apply, init: init, current: function () { return current; } };
})(window);
