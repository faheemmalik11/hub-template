// German dictionary — the DEFAULT locale and the single source of truth for German UI text.
// Strings here must stay byte-identical to the previous hard-coded German so the German UI
// looks unchanged. DB values, DB column names, and persisted audit text are NOT translated.
//
// NOTE: keys under `belege.workflow.*` are ALSO used (via a fixed-German translator) to build
// persisted audit text — see workflowLabelDe() in format.ts. Keep them accurate German.

const de = {
  tour: {
    onboarding: {
      steps: {
        title: "Die Onboarding-Checkliste",
        text: "Jede Zeile ist ein Schritt, der erledigt sein muss, bevor Sie sich im Alltag auf das System verlassen. Der Zustand wird direkt aus den echten Daten geprüft und lässt sich nicht von Hand abhaken.",
        hint: "Über den Pfeil rechts kommen Sie direkt zu dem Bildschirm, auf dem der Schritt erledigt wird.",
      },
    },
    open: "Tour",
    counter: "{{current}} von {{total}}",
    next: "Weiter",
    skip: "Tour überspringen",
    finish: "Fertig",
    sampleData: "Beispieldaten",
    cardTitle: "Geführte Tour",
    overview: {
      navigation: {
        title: "Die Seitenleiste",
        text: "Über diese Leiste erreichen Sie jeden Bereich der Anwendung. Wir gehen die Gruppen einmal kurz durch.",
        hint: "Ein Klick auf eine Gruppe klappt ihre Unterseiten auf.",
      },
      navInvoices: {
        title: "Rechnungen",
        text: "Hier liegt die tägliche Arbeit: eingehende Rechnungen von Lieferanten, Ihre eigenen Ausgangsrechnungen und manuelle Buchungen. Auch das Postfach, das neue Belege automatisch einsammelt, wird hier eingestellt.",
        hint: "Neue Belege landen zuerst unter Eingangsrechnungen.",
      },
      navBanking: {
        title: "Bank",
        text: "Alles rund um Ihre Konten: die Umsätze der verbundenen Bankkonten und der Abgleich, welche Zahlung zu welcher Rechnung gehört.",
        hint: "Unter Offene Posten sehen Sie, wo noch eine Zahlung oder eine Rechnung fehlt.",
      },
      navMasterData: {
        title: "Stammdaten",
        text: "Hier stehen Ihre Lieferanten, Kunden, Gesellschaften, Objekte und Kategorien. Jeder neue Beleg wird mit diesen Listen abgeglichen. Je vollständiger sie sind, desto mehr füllt das System von allein aus.",
        hint: "Diese Listen gehen Sie am besten als Erstes durch.",
      },
      navRules: {
        title: "Regeln",
        text: "Regeln nehmen Ihnen Entscheidungen ab, die Sie sonst immer wieder treffen müssten. Sie können festlegen, dass Rechnungen eines bestimmten Lieferanten immer zu einer bestimmten Kategorie gehören oder dass bestimmte Belege gar nicht erst importiert werden.",
        hint: "Jede Regel erspart Ihnen dieselbe Entscheidung bei jedem künftigen Beleg.",
      },
      navTax: {
        title: "Steuern",
        text: "Umsatzsteuer-Regeln, die Rücklage für die Steuer und die Übergabe der geprüften Belege an DATEV für den Steuerberater.",
        hint: "Die Übergabe an DATEV ist der letzte Schritt, wenn die Belege geprüft und freigegeben sind.",
      },
      navCostAnalysis: {
        title: "Kostenanalyse",
        text: "Auswertungen über Ihre Kosten: nach Gesellschaft, Objekt oder Kategorie, über frei wählbare Zeiträume.",
        hint: "Diesen Bereich sehen nur Personen mit der passenden Berechtigung.",
      },
      navAdministration: {
        title: "Verwaltung",
        text: "Ganz unten finden Sie Team und Rollen, Meldungen, das Protokoll und den Papierkorb.",
        hint: "Hier legen Sie auch fest, wer was sehen und tun darf.",
      },
      moneyCards: {
        title: "Ihre wichtigsten Zahlen",
        text: "Diese Karten fassen den gewählten Zeitraum zusammen. Sie zeigen, wie viel Sie an Lieferanten zahlen müssen, wie viel Sie selbst in Rechnung gestellt haben und wie viel davon am Ende übrig bleibt.",
        hint: "Den Zeitraum stellen Sie oben rechts ein, zum Beispiel auf diesen Monat oder auf dieses Jahr.",
      },
      chart: {
        title: "Die Entwicklung im Zeitverlauf",
        text: "Die Grafik zeigt zwei Linien. Die eine steht für die Rechnungen, die bei Ihnen eingegangen sind, die andere für die Rechnungen, die Sie selbst gestellt haben. So erkennen Sie, ob die Beträge steigen oder fallen.",
        hint: "Bei einem kurzen Zeitraum zeigt die Grafik einzelne Tage, bei einem langen Zeitraum ganze Monate.",
      },
      stages: {
        title: "Der Bearbeitungsstand",
        text: "Jede Rechnung durchläuft dieselben Schritte. Sie geht ein, wird geprüft, wird freigegeben, wird bezahlt und ist am Ende abgeschlossen. Die Kacheln zeigen, wie viele Rechnungen gerade in welchem Schritt liegen.",
        hint: "Ein Klick auf eine Kachel öffnet die Liste mit genau diesen Rechnungen.",
      },
      suppliers: {
        title: "Ihre größten Lieferanten",
        text: "Hier stehen die Lieferanten, an die im gewählten Zeitraum am meisten gezahlt wurde. Der Balken daneben zeigt ihren Anteil an den gesamten Ausgaben.",
        hint: "Ein Klick auf einen Namen öffnet alles, was zu diesem Lieferanten gehört.",
      },
      processing: {
        title: "Die automatische Belegverarbeitung",
        text: "Rechnungen kommen per E-Mail oder über die Ablage herein und werden automatisch ausgelesen. Hier sehen Sie, wie viele Dokumente eingegangen sind und wie viele davon ohne Fehler verarbeitet wurden.",
        hint: "Eine gelbe Zahl heißt, dass diese Belege noch von Ihnen geprüft werden müssen. Eine rote Zahl heißt, dass die Verarbeitung fehlgeschlagen ist.",
      },
      companyVolume: {
        title: "Ausgaben nach Gesellschaft",
        text: "Wie sich die Rechnungen dieses Zeitraums auf Ihre Gesellschaften verteilen, die größte zuerst und die Gesamtsumme darüber.",
        hint: "Ein Klick auf eine Gesellschaft öffnet deren Rechnungen.",
      },
      openItems: {
        title: "Was noch zu zahlen ist",
        text: "Die erste Zeile nennt den offenen Gesamtbetrag, die zweite die Anzahl der Rechnungen dahinter. Weitere Zeilen erscheinen nur dann, wenn etwas demnächst fällig wird oder bereits überfällig ist.",
        hint: "Erscheint eine Zeile zum Skonto, lohnt sich schnelles Zahlen, weil Sie dann einen Abzug auf den Rechnungsbetrag bekommen.",
      },
      bank: {
        title: "Ihre Bankumsätze",
        text: "Zu jeder Zahlung auf dem Konto sollte es eine passende Rechnung geben. Hier sehen Sie, welche Zahlungen bereits zu einer Rechnung gehören und welche noch offen sind.",
        hint: "In der Zeile zur Bestätigung wartet bereits ein Vorschlag. Sie müssen nur noch bestätigen, dass die Zuordnung stimmt.",
      },
    },
    outgoing: {
      queue: {
        title: "Der Stand Ihrer Ausgangsrechnungen",
        text: "Diese Karten teilen die Rechnungen auf, die Sie selbst gestellt haben: noch als Entwurf, verschickt, bezahlt. Die Zahl nennt die Menge, der Betrag darunter die Summe.",
        hint: "Ein Klick auf eine Karte filtert die Tabelle unten auf genau diese Rechnungen.",
      },
      filters: {
        title: "Suchen und einschränken",
        text: "Über das Suchfeld finden Sie eine Rechnung nach Kunde oder Nummer. Daneben schränken Sie die Tabelle auf eine Gesellschaft oder einen bestimmten Status ein.",
        hint: "Alle Einstellungen wirken zusammen, Sie können also gleichzeitig suchen und filtern.",
      },
      table: {
        title: "Die Rechnungen selbst",
        text: "Die Tabelle zeigt jede Ausgangsrechnung mit Kunde, Datum, Betrag und Status. Lange Listen sind auf Seiten aufgeteilt, unten wechseln Sie zwischen ihnen.",
        hint: "Ein Klick auf eine Zeile öffnet die Rechnung.",
      },
      actions: {
        title: "Eine Rechnung hochladen",
        text: "Hier laden Sie eine fertige, außerhalb entstandene Rechnung hoch, damit sie wie jede andere ausgelesen und verfolgt wird.",
        hint: "Hochgeladene Rechnungen landen in derselben Tabelle oben.",
      },
    },
    mailbox: {
      status: {
        title: "Läuft die Verarbeitung?",
        text: "Diese Leiste sagt auf einen Blick, ob Belege gerade automatisch eingesammelt werden, und wann der letzte Lauf war. Über „Protokoll ansehen“ kommen Sie zu den Details jedes Laufs.",
        hint: "Das eigentliche Auslesen übernimmt die Verarbeitungs-Pipeline, nicht dieser Bildschirm.",
      },
      sources: {
        title: "Ihre Belegquellen",
        text: "Jede Zeile ist eine Quelle: das E-Mail-Postfach, die Dropbox-Ablage und der manuelle Upload. „Bearbeiten“ öffnet die Einstellungen der Quelle.",
        hint: "Eine Quelle ohne Zielordner leert sich nie, richten Sie also beide Seiten ein.",
      },
    },
    reconcile: {
      intro: {
        title: "Zahlungen zu Rechnungen zuordnen",
        text: "Dieser Bildschirm bringt Bankzahlungen mit den Rechnungen zusammen, zu denen sie gehören. So sehen Sie, was ausgeglichen ist und was noch offen ist.",
        hint: "Der Untertitel ändert sich mit dem Bereich, in dem Sie sind.",
      },
      tabs: {
        title: "Zwei Sichten",
        text: "Der erste Bereich listet offene Posten zum Zuordnen, der zweite zeigt Rechnungen, zu denen noch keine Zahlung gefunden wurde. Die Zahl am Bereich nennt die Anzahl.",
        hint: "Wechseln Sie den Bereich, um zwischen Zuordnung und der Prüfung fehlender Zahlungen zu wechseln.",
      },
      filters: {
        title: "Den richtigen Fall finden",
        text: "Suchen Sie nach dem Namen des Geschäftspartners, oder grenzen Sie die Liste über die Filter weiter ein.",
        hint: "Der Name des Geschäftspartners führt am schnellsten zum Ziel, weil er auf beiden Seiten derselbe ist.",
      },
      list: {
        title: "Die offenen Posten",
        text: "Jede Zeile ist ein noch nicht ausgeglichener Posten. Ein Klick darauf öffnet die Zuordnung, in der Sie die passende Gegenbuchung auswählen und bestätigen.",
        hint: "Vorschläge sind bereits markiert. Sie müssen nur prüfen, ob der Vorschlag stimmt, und ihn bestätigen.",
      },
    },
    team: {
      tabs: {
        title: "Personen und Rollen",
        text: "Der erste Bereich listet die Personen, die sich anmelden können; der zweite legt fest, was jede Rolle sehen und tun darf.",
        hint: "Neue Kolleginnen und Kollegen fügen Sie über die Schaltfläche oben rechts hinzu.",
      },
      people: {
        title: "Die Personenliste",
        text: "Jede Person mit Zugang steht hier mit Rolle und Status.",
        hint: "Über die Suche und den Inaktiv-Filter finden Sie eine bestimmte Person schnell.",
      },
      actions: {
        title: "Was Sie pro Person tun können",
        text: "Der Stift öffnet die Zeile zum Bearbeiten: Name, E-Mail, Rolle und Gesellschaften. Der Schlüssel setzt ein neues, einmaliges Passwort für diese Person. Der Schild deaktiviert die Person, sodass sie sich nicht mehr anmelden kann, oder aktiviert sie wieder.",
        hint: "Ein deaktivierter Super-Admin-Zugang kann nicht ausgesperrt werden, deshalb lässt sich der letzte aktive Super-Admin nicht deaktivieren.",
      },
      permissionRow: {
        title: "So lesen Sie eine Zeile",
        text: "Jede Zeile ist ein Recht, jede Spalte eine Rolle. Ein Haken bedeutet, dass die Rolle dieses Recht hat. Ein Klick auf das Kästchen schaltet es sofort ein oder aus.",
        hint: "Eine Änderung gilt sofort für alle mit dieser Rolle, außer für Personen mit einer eigenen Ausnahme unter „Personen“.",
      },
      permissionGroup: {
        title: "",
        text: "Die Rechte dieser Gruppe und welche Rollen sie heute haben.",
        hint: "Geben Sie einer Rolle nur, was sie braucht. Was nicht angehakt ist, bleibt für alle mit dieser Rolle gesperrt.",
      },
      roles: {
        title: "Was jede Rolle darf",
        text: "Jede Zeile ist eine einzelne Berechtigung, jede Spalte eine Rolle. Ein Häkchen erlaubt dieser Rolle die Berechtigung, ein Klick auf das Kästchen schaltet sie um.",
        hint: 'Eine Änderung gilt sofort für alle Personen mit dieser Rolle, außer für Personen, denen unter "Personen" eine eigene Ausnahme gesetzt wurde.',
      },
    },
    incoming: {
      queue: {
        title: "Was als Nächstes zu tun ist",
        text: "Diese Karten teilen die Rechnungen danach auf, was mit ihnen geschehen muss: neu eingegangen, in Prüfung, freigegeben, bezahlt. Die Zahl nennt die Menge, der Betrag darunter die Summe.",
        hint: "Ein Klick auf eine Karte filtert die Liste unten auf genau diese Rechnungen.",
      },
      aiSearch: {
        title: "Suchen mit eigenen Worten",
        text: "Hier fragen Sie in normalem Deutsch nach dem, was Sie suchen, zum Beispiel nach allen offenen Handwerkerrechnungen des letzten Monats. Sie müssen keine Filter zusammenklicken.",
        hint: "Mit Enter schicken Sie die Frage ab. Über das Mikrofon können Sie sie auch sprechen.",
      },
      filters: {
        title: "Die Filterleiste",
        text: "Hier grenzen Sie die Liste nach Gesellschaft, Zeitraum und weiteren Merkmalen ein. Über die Schaltfläche für weitere Filter erreichen Sie alle übrigen Einstellungen.",
        hint: "Gesetzte Filter erscheinen als Chips unter der Leiste und lassen sich dort einzeln wieder entfernen.",
      },
      viewSwitch: {
        title: "Liste oder Tafel",
        text: "Die Liste zeigt alle Angaben nebeneinander in einer Tabelle. Die Tafel zeigt dieselben Rechnungen als Karten, in Spalten nach ihrem Bearbeitungsschritt geordnet.",
        hint: "Auf der Tafel ziehen Sie eine Karte in die nächste Spalte, um eine Rechnung weiterzugeben.",
      },
      upload: {
        title: "Eine Rechnung von Hand hinzufügen",
        text: "Die meisten Rechnungen kommen von selbst per E-Mail oder aus der Ablage herein. Wenn Ihnen jemand eine Rechnung auf Papier oder direkt in die Hand gibt, laden Sie sie hier hoch.",
        hint: "Sie wird danach genauso automatisch ausgelesen wie jede andere Rechnung.",
      },
    },
    incomingDetail: {
      header: {
        title: "Die Rechnung auf einen Blick",
        text: "Der Kopf nennt Aussteller, Betrag, Datum und Nummer sowie den Schritt, in dem die Rechnung gerade steht. Von hier aus geben Sie sie weiter oder stellen eine Rückfrage.",
        hint: "Alles, was hier steht, wurde automatisch ausgelesen und lässt sich von Ihnen ändern.",
      },
      document: {
        title: "Das Original",
        text: "Links sehen Sie das eingegangene Dokument selbst, also die PDF-Datei oder den Scan. Beim Blättern auf der rechten Seite bleibt es stehen, damit Sie jederzeit vergleichen können.",
        hint: "Prüfen Sie im Zweifel immer gegen das Original, nicht gegen die ausgelesenen Felder.",
      },
      fields: {
        title: "Die ausgelesenen Angaben",
        text: "Rechts stehen alle Felder, die aus dem Dokument gelesen wurden, und darunter die Prüfungen, die nicht aufgegangen sind. Hier ordnen Sie die Rechnung auch einer Gesellschaft und einem Objekt zu.",
        hint: "Ein Feld, bei dem sich das System nicht sicher war, ist gekennzeichnet und gehört zuerst angesehen.",
      },
      tabs: {
        title: "Die sechs Bereiche",
        text: "Die rechte Seite ist in sechs Bereiche geteilt. Übersicht zeigt die Kerndaten und die Zuordnung, Freigabe den Weg durch die Prüfung, Zahlung den Stand der Bezahlung, Lieferant die Angaben zum Absender, Details die restlichen ausgelesenen Felder und Verlauf, wer wann was geändert hat.",
        hint: "Auf einem schmalen Bildschirm wird aus der Leiste ein Auswahlfeld, das denselben Bereich öffnet.",
      },
    },
    incomingUpload: {
      dropzone: {
        title: "Datei auswählen",
        text: "Ziehen Sie eine oder mehrere Dateien in dieses Feld oder klicken Sie darauf, um sie auf Ihrem Rechner auszuwählen. PDF-Dateien und Fotos einer Rechnung sind beide möglich.",
        hint: "Mehrere Rechnungen auf einmal sind erlaubt, jede wird einzeln weiterverarbeitet.",
      },
      actions: {
        title: "Hochladen",
        text: "Mit dieser Schaltfläche schicken Sie die Dateien ab. Sie werden dann ausgelesen und erscheinen kurz darauf in der Liste der Eingangsrechnungen.",
        hint: "Abbrechen bringt Sie zurück zur Liste, ohne etwas hochzuladen.",
      },
    },
    outgoingUpload: {
      intro: {
        title: "Eine fertige Rechnung hochladen",
        text: "Dieser Weg ist für Rechnungen gedacht, die außerhalb des Programms entstanden sind. Sie laden die Datei hoch, das System liest die Angaben aus, und Sie prüfen sie anschließend.",
        hint: "Eine Rechnung, die Sie hier im Programm schreiben wollen, legen Sie stattdessen über Neue Rechnung an.",
      },
      dropzone: {
        title: "Rechnung auswählen",
        text: "Ziehen Sie die fertige Rechnung in dieses Feld oder klicken Sie darauf, um sie auf Ihrem Rechner zu suchen. Gemeint sind Rechnungen, die außerhalb des Programms entstanden sind.",
        hint: "Die Datei wird ausgelesen, damit Sie die Angaben nicht abtippen müssen.",
      },
    },
    manualBookings: {
      scope: {
        title: "Was Sie gerade sehen",
        text: "Oben wählen Sie die Gesellschaft und das Jahr. Die Tabelle darunter zeigt dann genau die Buchungen, die dazu gehören.",
        hint: "Mit der Auswahl Alle Gesellschaften sehen Sie stattdessen den gesamten Hub auf einmal.",
      },
      create: {
        title: "Eine Buchung erfassen",
        text: "Hier tragen Sie Posten ein, zu denen es weder einen Beleg noch eine Banküberweisung gibt, also zum Beispiel Personalkosten, Abschreibungen oder Steuern. Kosten werden dabei als positiver Betrag erfasst.",
        hint: "Etwas, das jeden Monat gleich anfällt, erfassen Sie einmal als wiederkehrende Buchung, statt es zwölfmal einzutippen.",
      },
      search: {
        title: "Suchen und sortieren",
        text: "Das Suchfeld durchsucht Notiz, Kategorie, Objekt und Gesellschaft. Daneben stellen Sie ein, wonach die Tabelle sortiert wird, etwa nach Zeitraum oder nach Betrag.",
        hint: "Suche und Sortierung wirken zusammen, Sie können also innerhalb eines Suchergebnisses weiter sortieren.",
      },
      table: {
        title: "Die erfassten Buchungen",
        text: "Jede Zeile zeigt Zeitraum, Kategorie, Objekt, Notiz und Betrag. Diese Buchungen zählen in der Auswertung genauso viel wie Belege.",
        hint: "Die gewählte BWA-Zeile entscheidet, wo eine Buchung in der Auswertung erscheint. Nur Materialaufwand und Wareneinsatz wirken sich auf den Rohertrag aus.",
      },
    },
    filenames: {
      structure: {
        title: "Wie ein Dateiname aufgebaut ist",
        text: "Jeder abgelegte Beleg bekommt denselben Aufbau aus Datum, Gesellschaft, Rechnungssteller, Beschreibung, Betrag und Objekt. Hier wählen Sie das Trennzeichen und entscheiden, welche dieser Bestandteile überhaupt mitgenommen werden.",
        hint: "Zeichen, die in Dateinamen nicht erlaubt sind, werden abgewiesen. Sonst würden sie beim Anlegen entfernt und die Bestandteile klebten aneinander.",
      },
      description: {
        title: "Woher die Beschreibung kommt",
        text: "Die Beschreibung ist der Teil des Namens, der sagt, worum es bei der Rechnung ging. Hier bestimmen Sie, aus welcher Angabe des Belegs dieser Text gebildet wird.",
        hint: "Sie können die Beschreibung auch ganz weglassen, wenn die Namen dadurch zu lang werden.",
      },
      preview: {
        title: "Die Vorschau",
        text: "Rechts sehen Sie an einem Beispiel, wie ein Dateiname mit Ihren aktuellen Einstellungen aussehen würde. Sie ändert sich sofort mit, wenn Sie links etwas umstellen.",
        hint: "Diese Einstellungen gelten ab dem Speichern. Bereits abgelegte Dateien behalten ihren bisherigen Namen.",
      },
    },
    bankTransactions: {
      actions: {
        title: "Umsätze holen",
        text: "Die Umsätze werden regelmäßig von selbst abgeholt. Hier stehen drei Schaltflächen: eine öffnet Ihre Bankkonten, eine holt neue Umsätze sofort, und die letzte importiert einen Kontoauszug aus einer Datei, wenn eine Bank sich nicht verbinden lässt.",
        hint: "Nach dem Abholen meldet Ihnen das System, wie viele Buchungen neu dazugekommen sind.",
      },
      filters: {
        title: "Umsätze eingrenzen",
        text: "Das Suchfeld durchsucht Geschäftspartner und Verwendungszweck. Daneben grenzen Sie auf ein Konto, eine Richtung, eine Buchungsart, einen Abgleichstand oder einen Zeitraum ein.",
        hint: "Die eingestellten Filter stehen in der Adresszeile. Sie können die Ansicht also als Link weitergeben oder als Lesezeichen speichern.",
      },
      list: {
        title: "Die Umsätze",
        text: "Jede Zeile ist eine Buchung auf einem Ihrer Konten, mit Datum, Geschäftspartner, Betrag und dem Stand des Abgleichs. Ein Klick öffnet die Buchung.",
        hint: "Ein Klick auf eine Spaltenüberschrift sortiert danach, und zwar über alle Seiten hinweg, nicht nur innerhalb der angezeigten.",
      },
    },
    bankTransactionDetail: {
      header: {
        title: "Die Buchung auf einen Blick",
        text: "Oben stehen der Betrag, die Art der Buchung, die Richtung und der Stand des Abgleichs. Ein Minus bedeutet, dass Geld abgeflossen ist.",
        hint: "Steht fest, dass es zu einer Ausgabe nie einen Beleg geben wird, halten Sie das hier oben rechts fest.",
      },
      data: {
        title: "Woher die Buchung kommt",
        text: "Links stehen Datum, Geschäftspartner, das eigene Konto, die Gesellschaft und der Verwendungszweck. Bei Ausgaben wählen Sie hier außerdem die Kategorie.",
        hint: "Die Kategorie entscheidet, wo eine Zahlung ohne Beleg in der Auswertung erscheint. Bei Einnahmen wird sie von der Rechnung übernommen.",
      },
      matches: {
        title: "Die passende Rechnung",
        text: "Rechts schlägt das System Rechnungen vor, die zu dieser Buchung passen könnten. Sie prüfen den Vorschlag und bestätigen ihn oder suchen selbst weiter.",
        hint: "Bei einer Ausgabe wird nach einer Eingangsrechnung gesucht, bei einer Einnahme nach einer Ihrer eigenen Rechnungen.",
      },
    },
    opos: {
      intro: {
        title: "Zahlungen ohne Beleg",
        text: "Zu manchen Zahlungen wird es nie eine Rechnung geben, etwa bei Gehalt, Steuern, privaten Entnahmen oder Umbuchungen zwischen eigenen Konten. Solche Zahlungen sollen den Abgleich nicht dauerhaft blockieren.",
        hint: "Eine Regel sagt dem System, dass zu diesen Zahlungen kein Beleg mehr verlangt wird. Sie warten dann nicht länger im Abgleich auf einen.",
      },
      actions: {
        title: "Regeln anlegen und anwenden",
        text: "Rechts oben legen Sie eine neue Regel an. Sie geben ein Stichwort ein, das im Verwendungszweck oder beim Geschäftspartner vorkommt, und wählen die passende Art.",
        hint: "Bevor Sie speichern, zeigt Ihnen das System, wie viele bestehende Zahlungen diese Regel treffen würde.",
      },
      filters: {
        title: "Eine Regel finden",
        text: "Suchen Sie nach einem Stichwort oder grenzen Sie die Liste auf eine Art von Zahlung oder auf abgeschaltete Regeln ein. Hilfreich, sobald die Liste länger als ein Bildschirm ist.",
        hint: "Die Spalte mit den Treffern zählt, wie viele Zahlungen eine Regel bisher ausgeblendet hat. So sehen Sie, welche Regeln wirklich etwas bewirken.",
      },
      list: {
        title: "Die bestehenden Regeln",
        text: "Jede Zeile ist eine Regel mit ihrem Stichwort, ihrer Art und der Anzahl der Zahlungen, die sie bisher erfasst hat. Über den Schalter rechts stellen Sie eine Regel vorübergehend ab.",
        hint: "Steht bei einer Regel null Treffer, wird sie meist von einer älteren Regel mit einem kürzeren Stichwort überdeckt. Die Zeile sagt Ihnen dann, von welcher.",
      },
    },
    suppliers: {
      header: {
        title: "Ihre Lieferanten",
        text: "Hier stehen alle Firmen, von denen Sie Rechnungen bekommen. Die meisten legen sich von selbst an, sobald die erste Rechnung eines Lieferanten eingelesen wurde.",
        hint: "Von Hand legen Sie einen Lieferanten nur an, wenn Sie ihn brauchen, bevor die erste Rechnung da ist.",
      },
      toolbar: {
        title: "Suchen und aufräumen",
        text: "Links suchen Sie nach einem Namen, rechts grenzen Sie die Liste weiter ein. Dort finden Sie auch die Vorschläge zum Zusammenführen.",
        hint: "Steht derselbe Lieferant doppelt in der Liste, etwa einmal mit und einmal ohne GmbH, führen Sie die beiden über diesen Vorschlag zusammen.",
      },
      list: {
        title: "Die Lieferantenliste",
        text: "Jede Zeile ist ein Lieferant. Ein Klick darauf öffnet seine Stammdaten und seine Bankverbindungen.",
        hint: "Die hinterlegte Bankverbindung wird für Überweisungen benutzt. Sie sollte deshalb stimmen.",
      },
    },
    customers: {
      header: {
        title: "Ihre Kunden",
        text: "Hier stehen die Empfänger Ihrer eigenen Rechnungen. Die Liste wird mit LexOffice abgeglichen, damit beide Seiten dieselben Kontakte kennen.",
        hint: "Ein neuer Kunde wird zuerst in LexOffice angelegt und erscheint anschließend auch hier.",
      },
      toolbar: {
        title: "Einen Kunden finden",
        text: "Über das Suchfeld finden Sie einen Kunden nach Namen. Die Anzeige daneben sagt Ihnen, wie viele Kunden gerade angezeigt werden.",
        hint: "Finden Sie jemanden nicht, fehlt der Kontakt meist noch in LexOffice.",
      },
      list: {
        title: "Die Kundenliste",
        text: "Jede Zeile ist ein Kunde. Ein Klick darauf zeigt seine Stammdaten und die Rechnungen, die Sie ihm gestellt haben.",
        hint: "Die Anschrift auf einer Rechnung kommt aus LexOffice, nicht aus diesem Bildschirm.",
      },
    },
    companies: {
      header: {
        title: "Ihre Gesellschaften",
        text: "Das Unternehmen besteht aus mehreren Gesellschaften. Jede Rechnung und jedes Objekt gehört genau zu einer davon, und danach richtet sich die gesamte Auswertung.",
        hint: "Eine neue Gesellschaft brauchen Sie selten. Wenn doch, legen Sie sie hier oben an.",
      },
      toolbar: {
        title: "Suchen und filtern",
        text: "Links suchen Sie nach Name oder Kürzel. Rechts grenzen Sie die Liste ein, unter anderem auf die Gesellschaften, deren Angaben wieder geprüft werden sollten.",
        hint: "Gesetzte Filter erscheinen als Chips darunter und lassen sich dort einzeln wieder entfernen.",
      },
      list: {
        title: "Die Gesellschaften",
        text: "Jede Zeile ist eine Gesellschaft mit ihrem Kürzel und ihren Angaben. Ein Klick darauf öffnet die Stammdaten und die Objekte, die dazu gehören.",
        hint: "Eine Markierung an einer Zeile heißt, dass die Angaben lange nicht bestätigt wurden. Ein Blick darauf und eine Bestätigung genügen.",
      },
    },
    properties: {
      header: {
        title: "Ihre Objekte",
        text: "Objekte sind die Immobilien und Projekte, auf die Kosten gebucht werden. Erst durch das Objekt wird aus einer Rechnung eine Ausgabe, die man einem Haus zuordnen kann.",
        hint: "Ein neues Objekt legen Sie hier oben an, sobald ein Haus oder ein Projekt dazukommt.",
      },
      toolbar: {
        title: "Objekte eingrenzen",
        text: "Über das Suchfeld finden Sie ein Objekt nach Code oder Name. Daneben stellen Sie ein, was angezeigt wird, etwa auch die bereits archivierten Objekte.",
        hint: "Ein Objekt, das es nicht mehr gibt, wird archiviert statt gelöscht. So bleiben die alten Rechnungen dazu erhalten.",
      },
      list: {
        title: "Die Objektliste",
        text: "Jede Zeile ist ein Objekt mit seinem Code und seinem Namen. Ein Klick darauf zeigt die Stammdaten und was bisher darauf gebucht wurde.",
        hint: "Der Code ist die Kurzform, die auf den Rechnungen auftaucht. Ändern Sie ihn nur, wenn Sie sicher sind.",
      },
    },
    supplierDetail: {
      header: {
        title: "Der Lieferant",
        text: "Oben stehen der Name des Lieferanten und die Schaltflächen, mit denen Sie ihn bearbeiten oder entfernen.",
        hint: "Der Name kommt aus den eingelesenen Rechnungen. Sie dürfen ihn korrigieren, wenn er unschön geschrieben ist.",
      },
      content: {
        title: "Stammdaten und Bankverbindungen",
        text: "Links stehen die Angaben zum Lieferanten, rechts die Konten, die auf seinen Rechnungen aufgetaucht sind.",
        hint: "Prüfen Sie eine neu aufgetauchte Bankverbindung, bevor Sie darauf überweisen. Genau hier setzen Betrugsversuche an.",
      },
    },
    customerDetail: {
      header: {
        title: "Der Kunde",
        text: "Oben stehen der Name des Kunden und die Schaltfläche zum Bearbeiten.",
        hint: "Änderungen gehen zuerst nach LexOffice und werden von dort hierher übernommen.",
      },
      content: {
        title: "Stammdaten und Rechnungen",
        text: "Links stehen die Angaben zum Kunden, rechts alle Rechnungen, die Sie ihm bisher gestellt haben.",
        hint: "Die Anschrift, die auf einer Rechnung gedruckt wird, stammt aus LexOffice.",
      },
    },
    companyDetail: {
      header: {
        title: "Die Gesellschaft",
        text: "Oben stehen Name und Kürzel der Gesellschaft sowie die Schaltflächen zum Bearbeiten und Archivieren.",
        hint: "Das Kürzel taucht überall in der Anwendung auf, unter anderem in den Dateinamen der Belege.",
      },
      content: {
        title: "Stammdaten und Objekte",
        text: "Links stehen die Angaben zur Gesellschaft, rechts die Objekte, die ihr zugeordnet sind.",
        hint: "Sind die Angaben lange nicht geprüft worden, erscheint oben ein Hinweis. Ein kurzer Blick und eine Bestätigung räumen ihn weg.",
      },
    },
    propertyDetail: {
      header: {
        title: "Das Objekt",
        text: "Oben stehen Code und Name des Objekts sowie die Schaltflächen zum Bearbeiten und Archivieren.",
        hint: "Erscheint hier ein Hinweis, dass die Angaben geprüft werden sollten, genügt ein Blick darauf und eine Bestätigung.",
      },
      content: {
        title: "Stammdaten und Buchungen",
        text: "Links stehen die Angaben zum Objekt, rechts die Gesellschaften, zu denen es gehört, und was bisher darauf gebucht wurde.",
        hint: "Welcher Gesellschaft ein Objekt zugeordnet ist, legen Sie direkt am Objekt fest.",
      },
    },
    bankAccounts: {
      header: {
        title: "Ihre Bankkonten",
        text: "Hier stehen alle Konten, deren Umsätze im System landen. Rechts oben verbinden Sie eine Bank oder legen ein Konto von Hand an, je nachdem, in welchem Bereich Sie gerade sind.",
        hint: "Jedes Konto gehört zu einer Gesellschaft. Diese Zuordnung entscheidet, wem die Umsätze zugerechnet werden.",
      },
      toolbar: {
        title: "Umschalten, suchen, filtern",
        text: "Links wählen Sie zwischen den Konten, die eine Bank liefert, und den Konten, die Sie selbst angelegt haben. Rechts daneben suchen und filtern Sie innerhalb des gewählten Bereichs.",
        hint: "Das Suchfeld durchsucht Name, IBAN und Inhaber.",
      },
      connected: {
        title: "Konten von der Bank",
        text: "Diese Konten kommen über eine Bankverbindung herein. Sie sind nach Verbindung gruppiert, und die Kopfzeile jeder Gruppe zeigt den Zustand, den Modus und den Zeitpunkt der letzten Abholung.",
        hint: "Eine Freigabe bei der Bank läuft nach einiger Zeit ab. Steht das in der Kopfzeile, muss sie erneuert werden, sonst kommen keine Umsätze mehr.",
      },
      manual: {
        title: "Konten von Hand",
        text: "Diese Konten haben Sie selbst angelegt, etwa weil die Bank sie nicht liefert. Umsätze kommen hier nicht automatisch herein.",
        hint: "Ein Konto lässt sich abschalten statt löschen. Dann bleiben die alten Umsätze erhalten, es kommen nur keine neuen dazu.",
      },
    },
    assignmentRules: {
      playground: {
        title: "Regeln testen",
        text: 'Im Bereich "Testen" probieren Sie eine Regel aus, bevor Sie sie speichern. Sie sehen sofort, welche Belege die Regel treffen würde.',
        hint: "Der Test verändert keine Daten. Er zeigt nur eine Vorschau.",
      },
      tabsRegeln: {
        title: "Drei Bereiche",
        text: '"Regeln" zeigt die bestehenden Zuordnungsregeln. Unter "Testen" probieren Sie eine Regel aus, ohne etwas zu speichern. Unter "Vorschläge" stehen Regeln, die das System aus Ihren bisherigen Belegen ableitet.',
        hint: "Die Kategorien selbst pflegen Sie unter Stammdaten.",
      },
      categories: {
        title: "Die Kategorien",
        text: "Kategorien fassen Kosten und Erlöse zu Gruppen zusammen, etwa Materialaufwand oder Raumkosten. Jede Rechnung bekommt am Ende genau eine davon.",
        hint: "Die gewählte Kategorie entscheidet, wo ein Betrag in der Auswertung erscheint.",
      },
      rules: {
        title: "Die Regeln",
        text: "Eine Regel setzt die Kategorie automatisch, damit die Vorkontierung im Haus passiert und nicht erst beim Steuerberater. Eine Regel kann Lieferant, Objekt und Gesellschaft in beliebiger Kombination festlegen.",
        hint: "Je genauer eine Regel ist, desto eher gewinnt sie. Eine Regel überschreibt niemals eine Kategorie, die Sie von Hand gesetzt haben.",
      },
      suggestions: {
        title: "Die Vorschläge",
        text: "Das System sucht in den bisherigen Rechnungen nach Mustern und schlägt Regeln vor, die es noch nicht gibt. Zum Beispiel, dass ein bestimmter Lieferant immer dieselbe Kategorie bekommt.",
        hint: "Ein Vorschlag legt nichts selbst an. Er füllt nur das Formular vor, und vor dem Speichern sehen Sie, wie viele Rechnungen sich dadurch ändern würden.",
      },
    },
    vatRules: {
      company: {
        title: "Für welche Gesellschaft",
        text: "Jede Gesellschaft rechnet ihre Umsatzsteuer bei ihrem eigenen Finanzamt ab. Deshalb wählen Sie zuerst, um welche es geht.",
        hint: "Mit der Auswahl aller Gesellschaften sehen Sie eine Aufstellung je Gesellschaft statt einer einzigen Summe.",
      },
      tabs: {
        title: "Regeln und Rücklage",
        text: "Im ersten Bereich legen Sie fest, welcher Steuersatz gilt und was abziehbar ist. Der zweite rechnet daraus aus, wie viel Sie zurücklegen sollten.",
        hint: "Die Tour zeigt den Bereich, in dem Sie gerade sind.",
      },
      rules: {
        title: "Die Steuerregeln",
        text: "Eine Regel legt den Steuersatz und die Abziehbarkeit für eine bestimmte Kombination fest, etwa für einen Lieferanten oder ein Objekt. Die Zähler darüber sagen, auf welcher Ebene wie viele Regeln hängen.",
        hint: "Auch hier gilt: die genaueste Regel gewinnt. Eine Regel für einen Lieferanten schlägt eine, die für die ganze Gesellschaft gilt.",
      },
      reserve: {
        title: "Die Steuerrücklage",
        text: "Aus der eingenommenen und der gezahlten Umsatzsteuer wird ausgerechnet, wie viel Sie voraussichtlich ans Finanzamt zahlen müssen und deshalb zurücklegen sollten.",
        hint: "Das ist eine Empfehlung, keine Buchung. Ein grüner Betrag bedeutet, dass Ihnen Geld zusteht statt umgekehrt.",
      },
    },
    approvals: {
      header: {
        title: "Wer eine Rechnung freigeben muss",
        text: "Auf dieser Seite verwalten Sie die Freigaberegeln. Eine Regel legt fest, welche Personen eine Rechnung nacheinander freigeben müssen, bevor sie bezahlt wird.",
        hint: "Für Rechnungen ohne passende Regel gilt der Standardweg.",
      },
      toolbar: {
        title: "Regeln und Playground",
        text: 'Der Bereich "Regeln" zeigt alle Freigaberegeln. Im Bereich "Playground" testen Sie mit einer Beispielrechnung, welche Regel greifen würde.',
        hint: 'Eine neue Regel legen Sie oben rechts mit "Neue Regel" an.',
      },
      list: {
        title: "Die Freigaberegeln",
        text: "Jede Zeile ist eine Regel. Die Zeile zeigt zuerst, für welche Rechnungen die Regel gilt, und dahinter die Freigeber in ihrer festen Reihenfolge.",
        hint: "Benennen Sie in jeder Regel eine Vertretung. Ohne Vertretung wartet die Rechnung, bis die zuständige Person wieder da ist.",
      },
    },
    exclusions: {
      header: {
        title: "Was gar nicht erst hereinkommen soll",
        text: "Nicht jede E-Mail im Postfach ist eine Rechnung. Mit einer Ausschlussregel sorgen Sie dafür, dass Newsletter, Werbung und Ähnliches beim Import übersprungen werden.",
        hint: "Ausgeschlossenes wird nicht importiert. Es taucht danach in keiner Liste auf, also gehen Sie mit weiten Begriffen vorsichtig um.",
      },
      list: {
        title: "Die Regeln",
        text: "Jede Zeile nennt einen Bereich und einen Begriff. Passt der Begriff im gewählten Bereich, wird der Beleg übersprungen.",
        hint: "Manche Bereiche greifen vor der automatischen Auslesung, etwa Absender oder Betreff, andere danach auf den erkannten Feldern.",
      },
    },
    costAnalysis: {
      header: {
        title: "Was unter dem Strich übrig bleibt",
        text: "Dieser Bildschirm stellt Ihre Einnahmen Ihren Ausgaben gegenüber und zeigt, was übrig bleibt. Er ist die Sicht für zwischendurch, keine Auswertung vom Steuerberater.",
        hint: "Das kleine i neben der Überschrift sagt, woher die einzelnen Zahlen kommen.",
      },
      filters: {
        title: "Auswählen, was Sie sehen",
        text: "Wählen Sie hier den Zeitraum und, wenn Sie möchten, eine einzelne Gesellschaft oder ein Objekt. Alle Zahlen darunter ändern sich mit Ihrer Auswahl.",
        hint: "Ihre Auswahl steht neben den Filtern, damit Sie immer wissen, worauf sich die Zahlen beziehen.",
      },
      figures: {
        title: "Die vier Zahlen",
        text: "Was Sie eingenommen haben, was nach Materialkosten übrig ist, was Sie ausgegeben haben und was am Ende bleibt. Jede Zahl mit dem Vergleich zum Zeitraum davor.",
        hint: "Ohne Einnahmen im Zeitraum bleiben die Prozentwerte leer, weil sich ein Anteil dann nicht berechnen lässt.",
      },
      breakdown: {
        title: "Woher die Zahlen kommen",
        text: "Die Grafik zeigt den Verlauf über die Zeit. Die Tabelle darunter teilt die Kosten nach Art auf, damit Sie sehen, was eine Veränderung ausgelöst hat.",
        hint: "Ein Klick auf eine Zeile zeigt die Rechnungen dahinter. Jede Zahl lässt sich bis zum einzelnen Beleg zurückverfolgen.",
      },
    },
    datevHandover: {
      header: {
        title: "Die Übergabe an den Steuerberater",
        text: 'Auf dieser Seite übergeben Sie die geprüften Belege an Ihren Steuerberater. "Monatsexport" lädt die Belege eines Monats auf Ihren Rechner herunter, ohne dass das protokolliert wird. "Sammelversand" verschickt alle bereitstehenden Belege auf einmal per E-Mail und hält fest, wann das war.',
        hint: '"Sammelversand" erscheint nur, wenn tatsächlich etwas zum Senden bereitsteht.',
      },
      list: {
        title: "Der Stand je Gesellschaft",
        text: 'Jede Zeile ist eine Gesellschaft. Ist DATEV eingerichtet, klicken Sie auf "Senden", um die Belege dieser Gesellschaft zu verschicken. Ist es das nicht, klicken Sie zuerst auf "Einrichten".',
        hint: "Die drei Punkte öffnen dasselbe Einrichten erneut oder zeigen die bisherigen Übergaben dieser Gesellschaft.",
      },
    },
    notifications: {
      tabs: {
        title: "Meldungen und Benachrichtigungen",
        text: "Der erste Bereich sammelt alles, was auf Sie wartet, sortiert nach Warnungen, Aufgaben und Hinweisen. Benachrichtigungen legen fest, worüber Sie informiert werden, und sind Administratoren vorbehalten.",
        hint: "Dieselben Meldungen erscheinen auch hinter der Glocke oben rechts und auf der Übersicht.",
      },
      alerts: {
        title: "Was auf Sie wartet",
        text: "Jede Zeile sagt in einem Satz, was passiert ist und was Sie tun sollen, etwa dass Ihnen eine Rechnung zugewiesen wurde oder dass es eine Rückfrage an Sie gibt.",
        hint: "Eine Meldung verschwindet erst, wenn Sie sie ausblenden oder die Sache erledigt ist. Sie nur anzusehen genügt nicht.",
      },
      bell: {
        title: "Die Glocke oben rechts",
        text: "Hier schalten Sie jede Meldungsart einzeln ein oder aus. Was Sie ausschalten, erscheint danach nicht mehr in der Glocke.",
        hint: "Die Einstellung gilt nur für Sie selbst, nicht fürs ganze Team.",
      },
      slack: {
        title: "Slack-Benachrichtigungen",
        text: 'Ist Slack verbunden, verschickt jeder eingeschaltete Punkt oben eine Nachricht in Slack, sobald er eintritt. Unter "Persönliche Benachrichtigungen" sehen Sie, wie viele Personen mit ihrem Slack-Konto verknüpft sind, nur diese erhalten Nachrichten direkt. Die Tageszusammenfassung fasst die gewählten Themen zu einer festen Uhrzeit in einem Kanal zusammen.',
        hint: 'Mit "Testnachricht senden" prüfen Sie, ob die Verbindung wirklich funktioniert, bevor Sie sich auf sie verlassen.',
      },
    },
    log: {
      header: {
        title: "Was die Verarbeitung gemacht hat",
        text: "Das Protokoll zeichnet auf, welche Dokumente eingegangen sind, was davon gelesen werden konnte und wo etwas schiefging.",
        hint: "Fehlt eine Rechnung, die eigentlich hätte ankommen sollen, ist das der Ort, an dem Sie nachsehen.",
      },
      tabs: {
        title: "Zwei Sichten",
        text: "Der erste Bereich zeigt die Verarbeitung der eingehenden Dokumente. Der zweite zeigt die Änderungen, also wer wann was am Datenbestand geändert hat.",
        hint: "Für die Frage, warum ein Wert heute anders aussieht als gestern, ist der zweite Bereich der richtige.",
      },
    },
    trash: {
      header: {
        title: "Der Papierkorb",
        text: "Gelöschtes wird nicht sofort entfernt, sondern landet hier. Von hier holen Sie es zurück oder löschen es endgültig.",
        hint: "Das gilt für Belege, Lieferanten und andere Datensätze gleichermaßen, damit ein versehentliches Löschen nicht das Ende ist.",
      },
      filters: {
        title: "Das Richtige finden",
        text: "Über die Suche und die Auswahl daneben grenzen Sie ein, welche Art von gelöschten Datensätzen angezeigt wird.",
        hint: "Wissen Sie noch, wann etwas gelöscht wurde, ist die Sortierung nach Datum meist der schnellste Weg.",
      },
      list: {
        title: "Die gelöschten Datensätze",
        text: "Jede Zeile zeigt, was gelöscht wurde, von wem und wann. Rechts stehen die beiden Möglichkeiten: wiederherstellen oder endgültig löschen.",
        hint: "Endgültig gelöscht heißt endgültig. Danach lässt sich der Datensatz nicht mehr zurückholen.",
      },
    },
  },
  mehrLaden: {
    rest_one: "… {{count}} weiterer Eintrag",
    rest_other: "… {{count}} weitere Einträge",
  },
  aliases: {
    title: "Namensvarianten",
    anzahl_one: "{{count}} Variante",
    anzahl_other: "{{count}} Varianten",
    hinweis: {
      gesellschaft:
        "Namensvarianten, unter denen diese Gesellschaft auf Belegen auftaucht. Die Pipeline ordnet Belege darüber automatisch zu.",
      objekt:
        "Namensvarianten, unter denen dieses Objekt auf Belegen auftaucht. Die Pipeline ordnet Belege darüber automatisch zu.",
      lieferant:
        "Namensvarianten, unter denen dieser Lieferant auftritt. Wird beim Zusammenführen zweier Lieferanten automatisch ergänzt.",
    },
    placeholder: "Neue Variante …",
    hinzufuegen: "Hinzufügen",
    entfernen: "Entfernen",
    empty: "Keine Namensvarianten erfasst.",
    confirm: {
      title: "Variante entfernen?",
      desc: "„{{alias}}“ wird nicht mehr als Namensvariante geführt. Sie kann jederzeit erneut hinzugefügt werden.",
      cancel: "Abbrechen",
      confirm: "Entfernen",
    },
    toast: {
      hinzugefuegt: "Variante „{{alias}}“ hinzugefügt.",
      entfernt: "Variante „{{alias}}“ entfernt.",
      bereitsVorhanden: "Diese Variante ist bereits erfasst.",
      beanspruchtVonAnderer:
        "„{{alias}}“ ist bereits einer anderen Einheit zugeordnet. Eine Variante kann nur zu einer gehören, bitte dort zuerst entfernen.",
      fehlgeschlagen: "Hinzufügen fehlgeschlagen: {{error}}",
    },
  },
  app: {
    language: "Sprache",
    languageGerman: "Deutsch",
    languageEnglish: "Englisch",
  },

  // Reusable across the app (copy-to-clipboard control).
  common: {
    // Shared form vocabulary. The asterisk next to a required label reads as one, and this is
    // what it says on hover and to a screen reader.
    form: {
      pflichtfeld: "Pflichtfeld",
    },
    datum: {
      waehlen: "Datum wählen …",
      leeren: "Datum leeren",
      kalender: "Kalender öffnen",
    },
    copy: {
      copied: "{{label}} kopiert",
      copiedGeneric: "Kopiert",
      failed: "Kopieren nicht möglich",
      action: "{{label}} kopieren",
      actionGeneric: "Kopieren",
    },
    combobox: {
      placeholder: "Auswählen …",
      search: "Suchen …",
      empty: "Kein Eintrag gefunden.",
    },
    multiCombobox: {
      countSelected: "{{count}} ausgewählt",
      weitere: "+{{count}} weitere",
    },
    // Shared client-side list pagination (suppliers, companies, properties).
    pagination: {
      perPage: "Pro Seite",
      showing: "Zeige {{from}}–{{to}} von {{total}}",
      page: "Seite {{page}} von {{pages}}",
      prev: "Zurück",
      next: "Weiter",
    },
    // Shared dropdown sort control.
    sort: {
      label: "Sortieren nach",
      asc: "Aufsteigend",
      desc: "Absteigend",
    },
  },

  // Top navigation (header). Group labels + page links.
  // Shared wording for role-gated pages (components/layout/kein-zugriff.tsx). Papierkorb keeps its
  // own, more specific text under papierkorb.guard, which can name what is being withheld.
  zugriff: {
    titel: "Kein Zugriff auf diese Seite",
    textAdmin:
      "Diese Seite ist nur für Administratoren. Ihr Konto hat diese Rolle nicht. Wenn Sie hier etwas erledigen müssen, wenden Sie sich an eine Administratorin oder einen Administrator.",
    textManager:
      "Diese Seite ist für Vorgesetzte und Administratoren. Ihr Konto hat diese Rolle nicht. Wenn Sie diese Daten brauchen, wenden Sie sich an Ihre Vorgesetzte oder Ihren Vorgesetzten.",
    rechteNichtGeladen:
      "Die Berechtigungen konnten nicht geladen werden. Vorsichtshalber ist nichts freigeschaltet. Bitte laden Sie die Seite neu und informieren Sie eine Administratorin oder einen Administrator, wenn es bestehen bleibt.",
    zurueck: "Zur Übersicht",
  },
  auth: {
    error: {
      missing_credentials: "Bitte E-Mail und Passwort eingeben.",
      invalid_login: "E-Mail oder Passwort ist falsch.",
      email_not_confirmed: "E-Mail noch nicht bestätigt.",
      rate_limited: "Zu viele Versuche. Bitte kurz warten.",
      account_deactivated:
        "Dieses Konto ist deaktiviert. Bitte wenden Sie sich an einen Administrator.",
      password_too_short: "Das Passwort muss mindestens 8 Zeichen lang sein.",
    },
    login: {
      heading: "Anmelden",
      subheading: "Bitte melden Sie sich mit Ihrem {{brand}}-Zugang an.",
      panelTitleLine1: "Buchhaltung, sauber",
      panelTitleLine2: "an einem Ort.",
      panelSubtitle: "Internes Buchhaltungs-Cockpit. Zugang nur für das {{brand}}-Team.",
      email: "E-Mail",
      emailPlaceholder: "name@{{domain}}",
      password: "Passwort",
      submit: "Anmelden",
      submitting: "Anmelden …",
      failed: "Anmeldung fehlgeschlagen.",
    },
    setPassword: {
      kicker: "Erste Anmeldung",
      heading: "Passwort festlegen",
      panelTitleLine1: "Willkommen im",
      panelTitleLine2: "Buchhaltungs-Cockpit.",
      panelSubtitle: "Ein letzter Schritt, bevor es losgeht: bitte ein eigenes Passwort festlegen.",
      hint: "{{email}}. Das Einmal-Passwort muss vor der ersten Nutzung durch ein eigenes ersetzt werden.",
      newPassword: "Neues Passwort",
      confirmPassword: "Passwort bestätigen",
      minLengthNote: "Mindestens 8 Zeichen.",
      submit: "Passwort speichern",
      submitting: "Speichert …",
      mismatch: "Die Passwörter stimmen nicht überein.",
      failed: "Passwort konnte nicht gesetzt werden.",
      logout: "Abmelden",
    },
    panelFooter: "{{brand}} · Intern",
    showPassword: "Passwort anzeigen",
    hidePassword: "Passwort verbergen",
  },

  demo: {
    badge: "Demo-Umgebung",
    heading: "Registrieren",
    subheading: "Profil auswählen, um die Demo zu starten.",
    panelTitleLine1: "Die {{brand}}-Gruppe",
    panelTitleLine2: "an einem Ort.",
    panelFooter: "{{product}} · Demo",
    note: "Klick-Demo: keine echten Daten, keine Verbindung zu externen Systemen.",
    roleManagement: "Geschäftsführung (Vollzugriff)",
    roleAccounting: "Buchhaltung",
  },

  nav: {
    onboarding: "Onboarding-Checkliste",
    uebersicht: "Übersicht",
    rechnungen: "Rechnungen",
    eingangsrechnungen: "Eingangsrechnungen",
    ausgangsrechnungen: "Ausgangsrechnungen",
    zahlungen: "Bank",
    banktransaktionen: "Banktransaktionen",
    bankkonten: "Bankkonten",
    bankverbindungen: "Bankverbindungen",
    offenePosten: "Offene Posten",
    oposWhitelist: "Ausgeschlossene Zahlungen",
    bankEinstellungen: "Einstellungen",
    stammdaten: "Stammdaten",
    lieferanten: "Lieferanten",
    kunden: "Kunden",
    gesellschaften: "Gesellschaften",
    objekte: "Objekte",
    postfach: "Einstellungen",
    zuordnungsregeln: "Zuordnungsregeln",
    ustRegeln: "USt-Regeln",
    freigabeRegeln: "Freigabe-Regeln",
    datevUebergabe: "DATEV-Übergabe",
    ausschlussregeln: "Ausschlussregeln",
    manuelleBuchungen: "Manuelle Buchungen",
    auswertungen: "Kostenanalyse",
    protokoll: "Protokoll",
    verwaltung: "Verwaltung",
    team: "Team",
    benachrichtigungen: "Meldungen & Benachrichtigungen",
    regeln: "Regeln",
    steuern: "Steuern",
    kategorien: "Kategorien",
    steuerruecklage: "Steuerrücklage",
    papierkorb: "Papierkorb",
    dateibenennung: "Dateibenennung",
    toOverview: "Zur Übersicht",
    menu: "Menü",
    meinProfil: "Mein Profil",
    logout: "Abmelden",
    rueckfrageAnMich_one: "{{count}} Rückfrage an mich",
    rueckfrageAnMich_other: "{{count}} Rückfragen an mich",
  },

  // Buchhaltung-Health-Kachel auf der Übersicht (running / letzter Lauf / Fehler) — liest
  // public.pipeline_runs, aber "Pipeline" ist ein Entwicklerbegriff ohne Bedeutung für die
  // Buchhalterin; die Kachel heißt nach der Sache, die überwacht wird (der Belegeinzug).
  breadcrumb: {
    ariaLabel: "Navigationspfad",
    upload: "Beleg hochladen",
    ausgangsrechnungNeu: "Neue Ausgangsrechnung",
    ausgangsrechnungHochladen: "Ausgangsrechnung hochladen",
  },

  health: {
    title: "Buchhaltungsstatus",
    desc: "Läuft · letzter Lauf · Fehler",
    running: "Läuft …",
    never: "Noch kein Lauf",
    noRuns: "Kein Lauf",
    errorsN: "{{n}} Fehler",
  },

  // Start page ("/") — the module launcher + recent invoices.
  einstellungen: {
    titel: "Benachrichtigungen",
    sub: "Legen Sie fest, welche Meldungen im Hub erscheinen und welche über externe Kanäle gehen.",
    gespeichert: "Gespeichert.",
    speichern: "Speichern",
    glocke: {
      titel: "Glocke im Hub",
      desc: "Was in Ihrer Benachrichtigungsglocke erscheint.",
      gruppe: {
        zugewiesen: "Für mich",
        dokumente: "Belege & Zahlungen",
      },
    },
    digest: {
      titel: "Tageszusammenfassung",
      uhrzeit: "Uhrzeit",
      zeitzone: "Ihre Zeitzone: {{zone}}",
      inhalt: "In der Zusammenfassung enthalten",
    },
    kanaele: {
      slackTitel: "Slack-Benachrichtigungen",
      slackDesc: "Wichtige Hinweise und eine Tageszusammenfassung in Slack.",
      abschnittMeldungen: "Meldungen",
      event: {
        zuweisung: "Beleg mir zugewiesen",
        rueckfrage: "Rückfrage zu einem Beleg",
        abgelehnt: "Beleg abgelehnt und zurückgegeben",
        ping: "Freigabe- oder Feedback-Anfrage",
      },
      slackKanalScope:
        "Kanalliste nicht verfügbar. Fügen Sie in Slack die Berechtigung channels:read hinzu und installieren Sie die App erneut.",
      slackLaedt: "Wird aus Slack geladen …",
      slackPersonenTreffer: "{{found}} von {{total}} Personen in Slack gefunden",
      slackPersonKeine: "Nur Team-Kanal",
      slackPersonFehlt: "keine Slack-Adresse",
      slackPersonHinweis:
        "Personen werden über ihre E-Mail-Adresse in Slack gefunden. Stimmt sie nicht überein, gehen ihre Meldungen in den Team-Kanal.",
      slackAktiv: "Slack-Versand aktiv",
      slackAppErstellen: "Slack öffnen",
      slackVerbunden: "Slack ist verbunden",
      slackSchritt1:
        "Stäy zu Ihrem Slack hinzufügen. Klicken Sie unten auf Slack öffnen und machen Sie dann bei Slack Folgendes. Sie müssen dort Apps installieren dürfen.",
      slackSchritt1a:
        "Workspace auswählen und die Zusammenfassung bestätigen, die Slack anzeigt. Alles darin ist schon ausgefüllt.",
      slackSchritt1b: "Auf Install to Workspace klicken, dann auf Allow.",
      slackSchritt1c: "Links OAuth & Permissions öffnen und den Bot User OAuth Token kopieren.",
      slackSchritt2: "Zurück hierher kommen und diesen Schlüssel einfügen.",
      slackSchritt2Hinweis:
        "Der richtige Schlüssel beginnt mit xoxb-. Der Verification Token auf der Seite Basic Information ist ein anderer Wert und funktioniert nicht.",
      slackVerbinden: "Verbinden",
      slackTokenErsetzen: "Verbindung ändern",
      slackTrennen: "Trennen",
      slackTrennenTitel: "Slack trennen?",
      slackTrennenText:
        "Der Zugangsschlüssel wird gelöscht und es wird nichts mehr nach Slack gesendet. Sie können sich jederzeit neu verbinden.",
      slackGetrennt: "Slack wurde getrennt.",
      aenderungenSpeichern: "Änderungen speichern",
      abbrechen: "Abbrechen",
      slackTokenUngueltig:
        "Das ist nicht der richtige Schlüssel. Der richtige beginnt mit xoxb- und steht in Slack unter „OAuth & Permissions“.",
      slackKanal: "Team-Kanal",
      slackDm: "Persönliche Benachrichtigungen",
      test: "Testnachricht senden",
      letzterLaufOk: "Letzte Zustellung: {{time}}",
      letzterLaufFehler: "Letzte Zustellung: {{time}} · fehlgeschlagen",
      testOk: "Testnachricht gesendet. Prüfen Sie den Kanal.",
    },
    event: {
      neu: "Neue Belege",
      zuweisung: "Mir zugewiesen",
      rueckfrage: "Rückfragen an mich",
      abgelehnt: "Ablehnungen an mich",
      eskaliert: "Freigaben, die ich vertrete und die überfällig sind",
      zuPruefen: "Belege, die auf Prüfung warten",
      faellig: "Überfällige Rechnungen",
      vorschlaege: "Zahlungsvorschläge zu bestätigen",
      fehler: "Fehler in der Verarbeitung",
      ping: "Direkte Erinnerungen an mich",
      personen: "Offene Punkte je Person",
    },
  },

  notifications: {
    newBadge: "Neu",
    filter: {
      all: "Alle",
    },
    section: {
      alerts: "Warnungen",
      tasks: "Aufgaben",
      info: "Hinweise",
    },
    source: {
      intake: "Rechnungseingang",
      review: "Prüfung",
      invoices: "Rechnungen",
      bankMatching: "Bankabgleich",
      processing: "Dokumentverarbeitung",
      assignment: "Zuweisung",
      setup: "Einrichtung",
    },
    action: {
      view: "Ansehen",
      review: "Prüfen",
      reviewMatches: "Zuordnungen prüfen",
      viewErrors: "Fehler ansehen",
      viewInvoices: "Rechnungen ansehen",
      setup: "Einrichten",
      open: "Öffnen",
    },
    setupSource: {
      "folder-mail": "Belegquellen & Ablage",
      "folder-drive": "Belegquellen & Ablage",
      "folder-mail-address": "Belegquellen & Ablage",
      "folder-drive-sources": "Belegquellen & Ablage",
      bank: "Bankverbindung",
      companies: "Gesellschaften",
      properties: "Objekte",
      incomplete: "Einrichtung",
    },
    markAllRead: "Alle als gelesen markieren",
    markRead: "Als gelesen markieren",
    seeAllCount_one: "{{count}} weitere anzeigen",
    seeAllCount_other: "{{count}} weitere anzeigen",
    collapse: "Weniger anzeigen",
    // Stands in for the invoice number in an alert sentence when the receipt has none yet.
    belegOhneNummer: "ohne Nummer",
    // Alert sentences: what happened, then what to do about it. Two short sentences, so a
    // reader who does not know the system still understands why the row is there.
    msg: {
      belegOhneNummer: "ohne Nummer",
      zuweisungEine: "Rechnung {{beleg}} wurde Ihnen zugewiesen. Bitte kümmern Sie sich darum.",
      neu_one: "{{count}} neue Rechnung ist eingegangen. Sie kann bearbeitet werden.",
      neu_other: "{{count}} neue Rechnungen sind eingegangen. Sie können bearbeitet werden.",
      rueckfrage_one:
        "Zu {{count}} Rechnung gibt es eine Rückfrage an Sie. Ein Kollege wartet auf Ihre Antwort.",
      rueckfrage_other:
        "Zu {{count}} Rechnungen gibt es Rückfragen an Sie. Ihre Kollegen warten auf Antwort.",
      abgelehnt_one:
        "{{count}} Rechnung wurde abgelehnt und kam zu Ihnen zurück. Bitte korrigieren und erneut einreichen.",
      abgelehnt_other:
        "{{count}} Rechnungen wurden abgelehnt und kamen zu Ihnen zurück. Bitte korrigieren und erneut einreichen.",
      eskaliert_one:
        "{{count}} Freigabe in Ihrer Vertretung ist überfällig. Bitte entscheiden Sie, damit die Rechnung weitergeht.",
      eskaliert_other:
        "{{count}} Freigaben in Ihrer Vertretung sind überfällig. Bitte entscheiden Sie, damit die Rechnungen weitergehen.",
      zuPruefen_one:
        "{{count}} Rechnung wartet auf Prüfung. Bitte prüfen Sie, ob die Angaben stimmen.",
      zuPruefen_other:
        "{{count}} Rechnungen warten auf Prüfung. Bitte prüfen Sie, ob die Angaben stimmen.",
      faellig_one:
        "{{count}} Rechnung ist überfällig. Das Fälligkeitsdatum ist vorbei und sie muss noch bezahlt werden.",
      faellig_other:
        "{{count}} Rechnungen sind überfällig. Die Fälligkeitsdaten sind vorbei und sie müssen noch bezahlt werden.",
      vorschlaege_one:
        "{{count}} Zahlung wurde automatisch einer Rechnung zugeordnet. Bitte prüfen und bestätigen Sie den Vorschlag.",
      vorschlaege_other:
        "{{count}} Zahlungen wurden automatisch Rechnungen zugeordnet. Bitte prüfen und bestätigen Sie die Vorschläge.",
      fehler_one:
        "{{count}} Dokument konnte nicht verarbeitet werden. Im Protokoll steht, woran es lag.",
      fehler_other:
        "{{count}} Dokumente konnten nicht verarbeitet werden. Im Protokoll steht, woran es lag.",
      ping_one: "{{count}} Kollege bittet Sie, sich etwas anzusehen.",
      ping_other: "{{count}} Kollegen bitten Sie, sich etwas anzusehen.",
    },
    title: "Benachrichtigungen",
    empty: "Nichts Neues. Alles ist auf dem aktuellen Stand.",
    // The SCREEN a notification is about, shown beside it in the bell. Without this a row reads
    // the same whether it points at an invoice, a supplier or a payment.
    ziel: {
      invoice: "Eingangsrechnung",
      transaction: "Banktransaktion",
      supplier: "Lieferant",
      customer: "Kunde",
      property: "Objekt",
      page: "Seite",
      unbekannt: "Hub",
    },
    pingSent: "An {{name}}",
    pingSentWithNote: "An {{name}}: {{note}}",
    pingFrom: "Von {{name}}",
    pingFromWithNote: "Von {{name}}: {{note}}",
    zeitraum: {
      alle: "Alle Zeiträume",
      heute: "Heute",
      "7": "Letzte 7 Tage",
      "30": "Letzte 30 Tage",
    },
    alleAnsehen: "Alle ansehen",
    ausblenden: "Ausblenden",
    gelesen: "Gelesen",
    tabMeldungen: "Meldungen",
    tabEinstellungen: "Einstellungen",
  },

  ping: {
    aktion: "Jemanden benachrichtigen",
    titel: "Jemanden darum bitten",
    desc: "Die Person bekommt es in ihrer Glocke und, wenn Slack aktiv ist, als private Nachricht.",
    descAllgemein:
      "Die Person bekommt es in ihrer Glocke und, wenn Slack aktiv ist, als private Nachricht.",
    empfaenger: "Empfänger",
    empfaengerPlaceholder: "Person wählen",
    notiz: "Notiz (optional)",
    notizPlaceholder: "z. B. Bitte heute noch freigeben.",
    abbrechen: "Abbrechen",
    senden: "Erinnerung senden",
    wirdGesendet: "Wird gesendet …",
    gesendet: "Erinnerung gesendet.",
    fehlgeschlagen: "Es wurde nichts gesendet. {{error}}",
    unbekannterFehler: "Unbekannter Fehler.",
    keineEmpfaenger: "Es gibt niemanden sonst zum Benachrichtigen.",
    banner: {
      vonUnbekannt: "Jemand",
      ohneNotiz: "bittet Sie, sich das anzusehen.",
      schliessen: "Hinweis schließen",
    },
  },

  checklist: {
    subtitle:
      "Diese Schritte müssen einmal eingerichtet sein, bevor Sie sich im Alltag auf das System verlassen. Jeder Punkt wird direkt aus den echten Daten geprüft und lässt sich nicht von Hand abhaken.",
    summary: "{{done}} von {{total}} Schritten erledigt",
    step: {
      mailbox: {
        title: "Belegquellen & Ablage",
        action: "Einrichten",
        open: "Es wird noch keine Quelle gelesen. Verbinden Sie das Postfach oder die Ablage, damit Belege automatisch hereinkommen.",
        problem_one:
          "Eine Quelle ist aktiv, aber {{count}} Einstellung fehlt oder die Verbindung liefert nichts mehr.",
        problem_other:
          "Eine Quelle ist aktiv, aber {{count}} Einstellungen fehlen oder die Verbindung liefert nichts mehr.",
        moreProblems_one: "+ 1 weiterer Punkt.",
        moreProblems_other: "+ {{count}} weitere Punkte.",
        done: "Belege werden automatisch eingesammelt und nach der Verarbeitung abgelegt.",
      },
      bank: {
        title: "Bankverbindung",
        action: "Verbinden",
        open: "Noch kein Konto verbunden. Erst mit einer Bankverbindung können Zahlungen und Rechnungen abgeglichen werden.",
        problem_one: "{{count}} Verbindung liefert keine Umsätze mehr und muss erneuert werden.",
        problem_other:
          "{{count}} Verbindungen liefern keine Umsätze mehr und müssen erneuert werden.",
        done: "Mindestens ein Konto liefert Umsätze.",
      },
      companies: {
        title: "Gesellschaften",
        action: "Prüfen",
        open: "Noch keine Gesellschaft angelegt. Ohne Gesellschaften kann keine Rechnung zugeordnet werden.",
        problem_one: "Die Angaben von {{count}} Gesellschaft sollten bestätigt werden.",
        problem_other: "Die Angaben von {{count}} Gesellschaften sollten bestätigt werden.",
        done: "Alle Gesellschaften sind erfasst und bestätigt.",
      },
      properties: {
        title: "Objekte",
        action: "Prüfen",
        open: "Noch kein Objekt angelegt. Erst über die Objekte werden Kosten einem Haus zurechenbar.",
        problem_one: "Die Angaben von {{count}} Objekt sollten bestätigt werden.",
        problem_other: "Die Angaben von {{count}} Objekten sollten bestätigt werden.",
        done: "Alle Objekte sind erfasst und bestätigt.",
      },
      lexoffice: {
        title: "LexOffice",
        action: "Einrichten",
        open: "Noch keine Gesellschaft mit LexOffice verbunden. Darüber laufen Kunden und Ausgangsrechnungen.",
        problem_one:
          "{{count}} Gesellschaft ist noch nicht mit LexOffice verbunden. Für sie können keine Ausgangsrechnungen erstellt werden.",
        problem_other:
          "{{count}} Gesellschaften sind noch nicht mit LexOffice verbunden. Für sie können keine Ausgangsrechnungen erstellt werden.",
        done: "Alle Gesellschaften sind mit LexOffice verbunden.",
      },
      datev: {
        title: "DATEV-Übergabe",
        action: "Einrichten",
        open: "Für keine Gesellschaft ist eine DATEV-Adresse hinterlegt. Ohne sie können Belege nicht an den Steuerberater übergeben werden.",
        problem_one: "{{count}} Gesellschaft hat noch keine DATEV-Adresse für Eingangsrechnungen.",
        problem_other:
          "{{count}} Gesellschaften haben noch keine DATEV-Adresse für Eingangsrechnungen.",
        done: "Alle Gesellschaften können an DATEV übergeben.",
      },
    },
  },
  onboarding: {
    title: "Onboarding-Checkliste",
    progress: "Ihr Fortschritt",
  },
  home: {
    priority: {
      title: "Zuerst erledigen",
      openChecklist: "Checkliste öffnen",
    },
    setupWarning: {
      "folder-mail": {
        label: "Postfach",
        message:
          'Verarbeitete E-Mails bleiben im Posteingang liegen. Legen Sie im Postfach "Verarbeitete E-Mails hierhin verschieben" fest.',
      },
      "folder-drive": {
        label: "Ablage",
        message:
          'Verarbeitete Dateien bleiben im Quellordner liegen. Legen Sie in der Ablage "Verarbeitete Dateien hierhin verschieben" fest.',
      },
      "folder-mail-address": {
        label: "Postfach",
        message:
          "Das Postfach ist aktiv, aber es ist keine E-Mail-Adresse hinterlegt. Ohne Adresse kann nichts gelesen werden.",
      },
      "folder-drive-sources": {
        label: "Ablage",
        message:
          "Die Ablage ist aktiv, aber es ist kein Quellordner gewählt. Ohne Quellordner wird nichts gelesen.",
      },
      bank: {
        label: "Bankverbindung",
        message_one:
          "{{count}} Bankverbindung liefert keine Umsätze mehr, sie ist abgelaufen oder gestört. Bitte erneuern.",
        message_other:
          "{{count}} Bankverbindungen liefern keine Umsätze mehr, sie sind abgelaufen oder gestört. Bitte erneuern.",
      },
      companies: {
        label: "Gesellschaften",
        message_one: "Die Angaben von {{count}} Gesellschaft sollten wieder geprüft werden.",
        message_other: "Die Angaben von {{count}} Gesellschaften sollten wieder geprüft werden.",
      },
      properties: {
        label: "Objekte",
        message_one: "Die Angaben von {{count}} Objekt sollten wieder geprüft werden.",
        message_other: "Die Angaben von {{count}} Objekten sollten wieder geprüft werden.",
      },
      incomplete: {
        label: "Einrichtung",
        message_one: "Die Einrichtung ist noch nicht vollständig: {{count}} Schritt ist offen.",
        message_other: "Die Einrichtung ist noch nicht vollständig: {{count}} Schritte sind offen.",
      },
      datev: {
        label: "DATEV",
        message_one: "{{count}} Gesellschaft hat noch keine DATEV-Adresse für Eingangsrechnungen.",
        message_other:
          "{{count}} Gesellschaften haben noch keine DATEV-Adresse für Eingangsrechnungen.",
      },
    },
    zeitraumKurz: {
      alle: "Gesamt",
      "letzte-30-tage": "30 Tage",
      "aktueller-monat": "Dieser Monat",
      "letzter-monat": "Letzter Monat",
      "letzte-6-monate": "6 Monate",
      "letzte-12-monate": "12 Monate",
      "aktuelles-jahr": "Dieses Jahr",
      "letztes-jahr": "Letztes Jahr",
      benutzerdefiniert: "Eigener Zeitraum",
    },
    zeitraumAktion: {
      zurueck: "Zurück",
      reset: "Zurücksetzen",
    },
    chart: {
      title: "Rechnungen im Zeitverlauf",
    },
    money: {
      deltaBy: {
        alle: "{{pct}} % zum Zeitraum davor",
        "letzte-30-tage": "{{pct}} % zu den 30 Tagen davor",
        "aktueller-monat": "{{pct}} % zum Vormonat",
        "letzter-monat": "{{pct}} % zum Monat davor",
        "letzte-6-monate": "{{pct}} % zu den 6 Monaten davor",
        "letzte-12-monate": "{{pct}} % zu den 12 Monaten davor",
        "aktuelles-jahr": "{{pct}} % zum Vorjahr",
        "letztes-jahr": "{{pct}} % zum Jahr davor",
        benutzerdefiniert: "{{pct}} % zum gleich langen Zeitraum davor",
      },
      eingang: "Eingangsrechnungen",
      ausgang: "Ausgangsrechnungen",
      count: "{{n}} Rechnungen",
      grossProfit: "Gewinn (Rohertrag)",
      ohneBeleg: "Zahlungen ohne Beleg",
    },
    blockers: {
      title: "Steht gerade fest",
      clear: "Nichts blockiert. Alle Belege und Zahlungen sind in Bearbeitung.",
      zuPruefen: "Belege zu prüfen",
      ueberfaellig: "Ausgangsrechnungen überfällig",
      ohneBeleg: "Zahlungen ohne Beleg",
      blockiert: "Belege nicht abgleichbar",
    },
    stages: {
      title: "Bearbeitungsstand der Rechnungen",
      eingegangen: "Eingegangen",
      inPruefung: "In Prüfung",
      freigegeben: "Freigegeben",
      bezahlt: "Bezahlt",
      datev: "An DATEV",
      abgeschlossen: "Abgeschlossen",
    },
    rank: {
      total: "Gesamt: {{sum}}",
    },
    top: {
      title: "Top {{count}} Lieferanten",
      unbekannt: "Ohne Absender",
    },
    companies: {
      title: "Top {{count}} Gesellschaften nach Ausgaben",
      ohne: "Ohne Zuordnung",
    },
    processing: {
      title: "Belegverarbeitung",
      kanaele: "Nach Kanal:",
      lastRun: "Letzter Lauf: {{time}}",
      lastRunTitle: "Wann die automatische Verarbeitung zuletzt gelaufen ist.",
      runningNow: "Verarbeitung läuft",
      verarbeitet: "Dokumente verarbeitet",
      erkannt: "Fehlerfrei gelesen",
      zuPruefen: "Warten auf Prüfung",
      fehler: "Fehlgeschlagen",
      all: "Zum Protokoll",
    },
    bank: {
      title: "Bank",
      gesamt: "Alle Banktransaktionen",
      offen: "Noch ohne Rechnung",
      vorschlag: "Warten auf Bestätigung",
      zugeordnet: "Mit Rechnung verknüpft",
      ignoriert: "Ignoriert (kein Beleg nötig)",
      all: "Alle Transaktionen ansehen",
    },
    open: {
      title: "Unbezahlte Rechnungen",
      count: "Unbezahlte Belege",
      sum: "Noch zu zahlen",
      overdue: "Überfällig",
      none: "Alles bezahlt.",
      all: "Alle unbezahlten Rechnungen ansehen",
    },
    ablageWarnung: {
      mail: "Postfach",
      drive: "Ablage",
      message: {
        mail: "Für das Postfach ist kein Zielordner für verarbeitete E-Mails ausgewählt. Es wird nichts verschoben, der Ordner leert sich also nie.",
        drive:
          "Für Dropbox ist kein Zielordner für verarbeitete Dateien ausgewählt. Es wird nichts verschoben, der Ordner leert sich also nie.",
      },
      dismiss: "Hinweis ausblenden",
    },
    // The personal header block (components/home/attention-panel.tsx).
    attention: {
      greetMorning: "Guten Morgen, {{name}}",
      greetDay: "Guten Tag, {{name}}",
      greetEvening: "Guten Abend, {{name}}",
      greetMorningAnon: "Guten Morgen",
      greetDayAnon: "Guten Tag",
      greetEveningAnon: "Guten Abend",
      lead_one: "{{count}} Rechnung wartet auf Sie.",
      lead_other: "{{count}} Rechnungen warten auf Sie.",
      loading: "Wird geprüft, was auf Sie wartet …",
      clear: "Nichts liegt gerade bei Ihnen.",
      error: "Ihre offenen Punkte konnten nicht geladen werden.",
      more_one: "{{count}} weitere Rechnung ansehen",
      more_other: "{{count}} weitere Rechnungen ansehen",
      bucket: {
        rueckfrage_one: "{{count}} Rückfrage",
        rueckfrage_other: "{{count}} Rückfragen",
        zugewiesen_one: "{{count}} zugewiesen",
        zugewiesen_other: "{{count}} zugewiesen",
      },
      reason: {
        eskaliert: "überfällig, Sie sind Vertretung",
        abgelehnt: "abgelehnt, zurück an Sie",
        rueckfrage: "Rückfrage an Sie",
        zugewiesen: "Ihnen zugewiesen",
      },
    },
    title: "Übersicht",
    // The screen, not the plumbing: naming the ingestion pipeline and the database told the
    // reader nothing they can act on.
    subtitle: "Der Stand Ihrer Buchhaltung auf einen Blick.",
    empty: "Noch keine Belege vorhanden.",
    kachelFehler: "Konnte nicht geladen werden",
    volumenKurz: "Volumen",
    ausgangCount: "{{n}} Rechnungen",
    ausgangOffen: "{{n}} offen",
    ausgangUeberfaellig: "{{n}} überfällig",
    emptyZeitraum: "Keine Belege in {{period}}.",
    unknownSteller: "Unbekannter Steller",
    ohneNr: "ohne Nr.",
    belegeCount: "{{n}} Belege",
    zuPruefenErkannt: "{{zu}} zu prüfen · {{erkannt}} erkannt",
    erkannt: "{{erkannt}} erkannt",
    zuPruefenBadge: "{{n}} zu prüfen",
    volumenLabel: "Rechnungsvolumen",
    module: {
      eingangDesc: "Belege prüfen und der richtigen Gesellschaft / dem Objekt zuordnen",
      lieferantenSub: "im Stamm",
      objekteSub: "Objekte",
      auswertungenDesc: "Summen je Lieferant, Gesellschaft, Objekt und Monat",
      auswertungenSub: "Rohertrag",
      auswertungenSubZeitraum: "Rohertrag, {{period}}",
      protokollDesc: "Verarbeitungs-Log der eingehenden Belege",
      protokollKennzahl: "Log",
      protokollSub: "Eingang & Fehler",
      ausgangDesc: "Mieten, Provisionen, Maklergeschäft",
      ausgangSub: "Ausgangsrechnungen",
    },
  },

  belege: {
    // ---- badges / shared ----
    badge: {
      ustAbbr: "USt",
      ustNone: "0 %",
      ustRelevantTitle: "umsatzsteuerrelevant (_UST)",
      ustNoneTitle: "keine USt",
      ustFrei: "USt-frei",
      ustFreiTitle:
        "Der Beleg weist 0 % Umsatzsteuer aus, z. B. eine steuerfreie Leistung oder ein Kleinunternehmer.",
      ustUnbekannt: "USt unklar",
      ustUnbekanntTitle: "Auf dem Beleg wurde kein Umsatzsteuersatz erkannt.",
      ustGemischt: "USt gemischt",
      ustGemischtTitle:
        "Auf diesem Beleg gelten mehrere Umsatzsteuersätze ({{saetze}} %). Die Aufteilung steht im Detail unter Steuer.",
      bezahlt: "Bezahlt",
      offen: "Offen",
      bezahltTitle: "bezahlt",
      offenTitle: "offen",
      bankMatchVorschlag: "Vorschlag prüfen",
      bankMatchOffen: "Nicht zugeordnet",
      bankMatchOffenTitle: "Noch keine Banktransaktion zugeordnet.",
      bankMatchVorschlagTitle:
        "Eine Banktransaktion wurde vorgeschlagen, bitte im Abgleich prüfen.",
      bankMatchZugeordnetTitle: "Einer Banktransaktion zugeordnet und bestätigt.",
      bankMatchZugeordnet: "Zugeordnet",
      // "ohne" in a mono font, next to codes like STAY, read as one more code rather than as the
      // absence of one. Same wording as the filter option and the counter above the list, so the
      // three name the same thing the same way.
      gesellschaftOhne: "Ohne Gesellschaft",
      gesellschaftOhneTitle: "keiner Gesellschaft zugeordnet",
      lastschrift: "Lastschrift",
      lastschriftTitle: "Wird per Lastschrift eingezogen, nicht erneut überweisen",
      ibanErfasst: "IBAN erfasst",
      ibanErfasstTitle:
        "Für diesen Lieferanten war bisher keine IBAN hinterlegt. Aus dieser Rechnung wurde {{neu}} übernommen. Bitte prüfen, bevor gezahlt wird.",
      ibanGeaendert: "IBAN geändert",
      ibanGeaendertTitle: "Bisherige IBAN: {{alt}}. Neue IBAN: {{neu}}. Bitte prüfen.",
      unusualAmount: "Ungewöhnlicher Betrag",
      unusualAmountTitle:
        "Weicht deutlich von den sonst stabilen Beträgen dieses Lieferanten ab. Bitte prüfen.",
      datevBereit: "DATEV-bereit",
      datevBereitTitle: "Mit einer Transaktion verknüpft und an DATEV übergeben",
      datevUebergeben: "Übergeben",
      datevUebergebenTitle: "An DATEV übergeben",
      datevOffen: "Offen",
      datevOffenTitle: "Noch nicht an DATEV übergeben",
    },

    // ---- status (extraction quality) ----
    status: {
      erkannt: "Erkannt",
      zu_pruefen: "Zu prüfen",
    },

    // ---- workflow (approval chain) — also used for persisted German audit text ----
    workflow: {
      eingegangen: "Eingegangen",
      in_pruefung: "In Prüfung",
      rueckfrage: "Rückfrage",
      freigegeben_assistenz: "Freigegeben (Assistenz)",
      freigegeben_vorgesetzter: "Freigegeben (Vorgesetzter)",
      // "Bezahlt", the same word the payment column uses, and deliberately so: this step IS the
      // paid state. A DB trigger (migration 0036) sets it the moment paid_at is confirmed, from
      // wherever the payment was marked (bank match, auto-suggested or manual, or the manual paid
      // checkbox), so the two can never disagree. It was briefly called "Zahlung veranlasst" to
      // avoid the repetition; that made it read as a separate "instructed but not yet paid" stage,
      // which is not a state this chain has.
      bezahlt: "Bezahlt",
      // NOT "Übergeben (DATEV)". The DATEV column on the same row already says "Übergeben", and a
      // trigger (migration 0038) sets this step the moment datev_handed_over_at is written, so the
      // two badges are one event printed twice in the same words. The column reports the action, this
      // one says where the document now sits in the chain: gone to DATEV, waiting to be closed off.
      uebergeben_datev: "Bei DATEV",
      abgeschlossen: "Abgeschlossen",
      abgelehnt: "Abgelehnt",
      nicht_relevant: "Nicht relevant",
      actions: {
        send_for_review: "Zur Prüfung geben",
        complete: "Beleg abschließen",
        approve: "Prüfen & freigeben",
        final_approve: "Endgültig freigeben",
        return_with_query: "Mit Rückfrage zurückgeben",
        reject: "Ablehnen",
      },
      actionZiel: {
        send_for_review: "Geht in Prüfung",
        complete: "Wird abgeschlossen",
        approve: "Wird freigegeben",
        final_approve: "Endgültig freigegeben",
        return_with_query: "Geht als Rückfrage zurück",
        reject: "Wird abgelehnt",
      },
    },

    // ---- document type ----
    belegart: {
      // Lowercase keys are what the pipeline stores (belegartKey normalizes to these). The
      // capitalized ones stay for rows written before that.
      rechnung: "Rechnung",
      gutschrift: "Gutschrift",
      mahnung: "Mahnung",
      angebot: "Angebot",
      lieferschein: "Lieferschein",
      kontoauszug: "Kontoauszug",
      werbung: "Werbung",
      kein_beleg: "Kein Beleg",
      Eingangsrechnung: "Eingangsrechnung",
      Mahnung: "Mahnung",
      Angebot: "Angebot",
      Kontoauszug: "Kontoauszug",
    },

    // ---- source channel ----
    kanal: {
      email: "E-Mail",
      upload: "Upload",
      scan: "Scan",
      erechnung: "E-Rechnung",
      drive: "Drive",
    },

    // ---- confidence traffic light ----
    konfidenz: {
      // The per-field dot. Names the axis, because a coloured dot on its own says nothing
      // about what it is measuring.
      feldTitel: "KI-Konfidenz für dieses Feld",
      skala: {
        gruen: "Ab 95 %: sicher gelesen",
        gelb: "80 bis 95 %: bitte bestätigen",
        rot: "Unter 80 %: bitte prüfen",
      },
      gruen: "hohe Konfidenz",
      gelb: "mittlere Konfidenz, prüfen",
      rot: "niedrige Konfidenz, bitte prüfen",
      keine: "keine Konfidenz hinterlegt",
    },

    // ---- Erkennungs-Ampel (DB-Feld belege.ampel, Pipeline A2/A6) ----
    // Feldherkunft (welche Instanz hat diesen Wert entschieden) — Migration 0025.
    quelle: {
      human: "Manuell",
      rule: "Regel",
      ai: "KI",
      keine: "–",
      hint: {
        human: "Ein Mensch hat diesen Wert gesetzt. Keine automatische Regel überschreibt ihn.",
        rule: "Eine gespeicherte Regel hat diesen Wert gesetzt. Eine Korrektur von Hand hat Vorrang.",
        ai: "Der Wert kommt aus der KI-Extraktion. Eine Regel oder eine Korrektur von Hand darf ihn ersetzen.",
      },
    },
    ampel: {
      gruen: "Automatisch akzeptiert",
      gelb: "Bestätigen",
      rot: "Zu prüfen",
      keine: "–",
      hint: {
        gruen:
          "Die Konfidenz liegt bei 95 % oder höher und alle Prüfungen sind bestanden, also wurde der Beleg automatisch akzeptiert.",
        gelb: "Die Konfidenz liegt zwischen 80 und 95 %. Ein Mensch nickt kurz ab.",
        rot: "Die Konfidenz liegt unter 80 %, oder eine Prüfung ist fehlgeschlagen. Der Beleg muss manuell geprüft werden.",
        keine: "Noch nicht bewertet.",
      },
    },

    // ---- validation gates + review reasons ----
    validierung: {
      result: "Prüf-Ergebnis",
      kleinbetrag: "Kleinbetrag ≤ 250 €",
      kleinbetragTitle: "Bruttobetrag ≤ 250 €: §14 UStG relaxt (Rechnungsnummer/Datum optional)",
      state: {
        erfuellt: "erfüllt",
        nicht_erfuellt: "nicht erfüllt",
        nicht_anwendbar: "nicht anwendbar",
      },
      summeVergleich: "Erwartet {{erwartet}}, auf dem Beleg {{gefunden}}",
      gate: {
        gross_present: { label: "Bruttobetrag", hint: "Rechnungsbetrag (brutto) erkannt" },
        issuer_present: { label: "Rechnungssteller", hint: "Aussteller der Rechnung erkannt" },
        date_present: { label: "Rechnungsdatum", hint: "Belegdatum erkannt" },
        invoice_number_present: { label: "Rechnungsnummer", hint: "Rechnungsnummer erkannt" },
        sum_matches: { label: "Summe", hint: "Netto + USt = Brutto (±0,02 €)" },
        vat_rate_valid: { label: "USt-Satz", hint: "Steuersatz in der hinterlegten Liste" },
        iban_checksum_valid: { label: "IBAN", hint: "IBAN-Prüfsumme (Mod-97) korrekt" },
        iban_unambiguous: { label: "Bankverbindung", hint: "Konto für die Überweisung" },
        payable_iban_present: { label: "IBAN", hint: "IBAN für die Überweisung vorhanden" },
        recipient_present: { label: "Zahlungsempfänger", hint: "Empfänger der Zahlung erkannt" },
        date_not_future: { label: "Datum plausibel", hint: "Rechnungsdatum nicht in der Zukunft" },
        relevance_ok: { label: "Belegart", hint: "Ist das eine Rechnung, die hierher gehört?" },
        assignment_resolved: { label: "Gesellschaft", hint: "Zuordnung aus den Stammdaten" },
        brutto_vorhanden: {
          label: "Bruttobetrag vorhanden",
          hint: "Rechnungsbetrag (brutto) erkannt",
        },
        steller_vorhanden: {
          label: "Rechnungssteller vorhanden",
          hint: "Aussteller der Rechnung erkannt",
        },
        datum_vorhanden: { label: "Rechnungsdatum vorhanden", hint: "Belegdatum erkannt" },
        rechnungsnr_vorhanden: {
          label: "Rechnungsnummer vorhanden",
          hint: "Rechnungsnummer erkannt",
        },
        summe_ok: { label: "Summe stimmig", hint: "Netto + USt = Brutto (±0,02 €)" },
        ust_satz_ok: { label: "USt-Satz gültig", hint: "Steuersatz in der hinterlegten Liste" },
        iban_ok: { label: "IBAN gültig", hint: "IBAN-Prüfsumme (Mod-97) korrekt" },
        iban_vorhanden: {
          label: "IBAN",
          hint: "IBAN für die Überweisung vorhanden",
        },
        empfaenger_vorhanden: {
          label: "Zahlungsempfänger",
          hint: "Empfänger der Zahlung erkannt",
        },
        datum_plausibel: { label: "Datum plausibel", hint: "Rechnungsdatum nicht in der Zukunft" },
        extraction_confidence: {
          label: "Erkennungs-Konfidenz",
          hint: "Wie sicher die KI die Felder gelesen hat",
        },
        relevance: { label: "Belegart", hint: "Ist das eine Rechnung, die hierher gehört?" },
        assignment: { label: "Gesellschaft", hint: "Zuordnung aus den Stammdaten" },
        iban_anzahl: { label: "Bankverbindung", hint: "Konto für die Überweisung" },
        empfaenger_name: { label: "Zahlungsempfänger", hint: "Empfänger der Zahlung erkannt" },
        forced_review: { label: "Manuell markiert", hint: "Vom Einlesen zur Prüfung gegeben" },
        safety_invariant_1: { label: "Überweisung", hint: "Belegt der Beleg eine Überweisung?" },
        safety_invariant_2: {
          label: "Lastschrift",
          hint: "Wird schon eingezogen oder ist bezahlt",
        },
        safety_invariant_3: { label: "OCR-Beleg", hint: "Nur gescannt gelesen, nicht als Text" },
        safety_invariant_4a: { label: "Belegart", hint: "Als Rechnung bestätigt" },
        safety_invariant_4b: { label: "Sicherheits-Untergrenze", hint: "Harte Konfidenzgrenze" },
        safety_invariant_5: { label: "Zahlungsabgleich", hint: "Wie aktuell der Abgleich ist" },
        document_readable: { label: "Lesbarkeit", hint: "Beleg konnte gelesen werden" },
        exclusion: { label: "Ausschlussregel", hint: "Vom Ausschluss erfasst" },
      },
      // review reasons (keyed by stable id returned from pruefGruende)
      grund: {
        brutto_fehlt: "Bruttobetrag fehlt",
        steller_fehlt: "Rechnungssteller fehlt",
        summe_stimmt_nicht: "Netto + USt ergeben nicht den Bruttobetrag",
        ust_satz_ungueltig: "USt-Satz ungültig",
        iban_ungueltig: "IBAN ungültig (Prüfsumme)",
        datum_zukunft: "Rechnungsdatum liegt in der Zukunft",
        rechnungsnr_fehlt: "Rechnungsnummer fehlt",
        datum_fehlt: "Rechnungsdatum fehlt",
        iban_fehlt: "Keine IBAN, aber der Beleg muss überwiesen werden",
        iban_mehrere: "{{count}} IBANs auf dem Beleg – bitte das Konto auswählen",
        konfidenz_unter_schwelle:
          "{{gefunden}} % · für die automatische Freigabe sind {{noetig}} % nötig",
        nicht_relevant: "Liest sich nicht als Rechnung, die dieser Ablauf verarbeitet",
        gesellschaft_fehlt: "Keine Gesellschaft aus Empfänger oder Objekt zuzuordnen",
        manuell_markiert: "Beim Einlesen zur Prüfung gegeben",
        keine_ueberweisung_belegt:
          "Auf dem Beleg steht nichts, was eine Überweisung verlangt – bitte selbst prüfen",
        lastschrift_erkannt:
          "Wird per Lastschrift eingezogen oder ist bereits bezahlt – nicht noch einmal überweisen",
        ocr_ohne_sichtpruefung:
          "Nur per OCR gelesen – ein Mensch schaut drauf, bevor der Beleg automatisch durchgeht",
        keine_rechnung_bestaetigt: "Nicht eindeutig als Rechnung bestätigt",
        konfidenz_unter_sicherheitsgrenze:
          "Konfidenz unter der harten Sicherheitsgrenze der Prüfregeln",
        zahlungsnachweis_veraltet: "Der Abgleich „bereits bezahlt“ ist nicht mehr aktuell",
        nicht_lesbar: "Der Beleg konnte nicht gelesen werden",
        ausgeschlossen: "Eine Ausschlussregel hat gegriffen",
        empfaenger_fehlt: "Kein Zahlungsempfänger auf dem Beleg",
      },
    },

    // ---- invoice list ----
    list: {
      title: "Eingangsrechnungen",
      // The screen, not the plumbing. It used to name the ingestion pipeline, which is not
      // a word anyone doing accounting has to know.
      subtitle:
        "Eingegangene Rechnungen prüfen, einer Gesellschaft und einem Objekt zuordnen und zur Zahlung freigeben.",
      upload: "Beleg hochladen",
      bulk: {
        spalte: "Auswahl",
        zeileWaehlen: "Beleg auswählen",
        seiteWaehlen: "Alle Belege auf dieser Seite auswählen",
        ausgewaehlt_one: "{{count}} Beleg ausgewählt",
        ausgewaehlt_other: "{{count}} Belege ausgewählt",
        auswahlAufheben: "Auswahl aufheben",
        abbrechen: "Abbrechen",
        anwenden: "Anwenden",
        laeuft: "Wird ausgeführt ...",
        fertig_one: "{{count}} Beleg aktualisiert",
        fertig_other: "{{count}} Belege aktualisiert",
        teilweise: "{{erfolg}} aktualisiert, {{fehler}} fehlgeschlagen",
        fehlgeschlagen: "Es wurde nichts geändert. {{meldung}}",
        archivieren: {
          label: "Archivieren",
          titel_one: "{{count}} Beleg archivieren",
          titel_other: "{{count}} Belege archivieren",
          beschreibung:
            "Die Belege bleiben mit ihrem Verlauf erhalten und verschwinden aus der Arbeitsliste.",
          feld: "Hinweis (optional)",
          platzhalter: "Warum wird archiviert, zum Beispiel: Beleg aus 2024",
        },
        nichtRelevant: {
          label: "Nicht relevant",
          titel_one: "{{count}} Beleg zurück ins Postfach",
          titel_other: "{{count}} Belege zurück ins Postfach",
          beschreibung:
            "Die Belege fallen aus der Bearbeitung und werden ans Postfach zurückgegeben.",
          feld: "Grund",
          platzhalter: "Zum Beispiel: gehört zu einer verkauften Gesellschaft",
        },
        gesellschaft: {
          label: "Gesellschaft zuweisen",
          titel_one: "Gesellschaft für {{count}} Beleg setzen",
          titel_other: "Gesellschaft für {{count}} Belege setzen",
          beschreibung: "Alle ausgewählten Belege bekommen dieselbe Gesellschaft.",
          feld: "Gesellschaft",
          platzhalter: "Gesellschaft wählen",
        },
        loeschen: {
          label: "In den Papierkorb",
          titel_one: "{{count}} Beleg löschen",
          titel_other: "{{count}} Belege löschen",
          beschreibung:
            "Die Belege landen im Papierkorb und lassen sich von dort wiederherstellen.",
          feld: "Löschgrund",
          platzhalter: "Warum wird gelöscht?",
        },
      },
      kpi: {
        gesamt: "Belege gesamt",
        erkannt: "Erkannt",
        zuPruefen: "Zu prüfen",
        volumenZeile: "{{count}} Rechnungen, {{summe}} insgesamt (ohne stornierte)",
        volumen: "Volumen (Brutto)",
        volumenHint: "Brutto-Summe aller Belege in dieser Auswahl, bezahlte eingeschlossen.",
        offen: "Noch zu zahlen",
        offenHint:
          "Brutto-Summe der Belege in dieser Auswahl, die noch nicht als bezahlt markiert sind.",
        ohneAmpelArchiv:
          "Diese Kacheln zählen alle Belege und berücksichtigen den Ampel-, Archiv- oder KI-Suche-Filter noch nicht.",
      },
      queue: {
        all: { label: "Alle Rechnungen", desc: "Alles in dieser Liste" },
        needs_action: { label: "Zu prüfen", desc: "Warten auf Ihre Prüfung" },
        missing_assignment: {
          label: "Gesellschaft fehlt",
          desc: "Ohne sie geht es nicht weiter",
        },
        ready_for_payment: { label: "Zahlbereit", desc: "Freigegeben, noch nicht bezahlt" },
        pay_now: { label: "Jetzt zu zahlen", desc: "Fällig, offen, keine Lastschrift" },
        completed: { label: "Erledigt", desc: "Bezahlt und abgeschlossen" },
      },
      aktion: {
        review: "Rechnung prüfen",
        approve: "Endgültig freigeben",
        pay: "Jetzt bezahlen",
        match: "Zahlung zuordnen",
        none: "Nichts zu tun",
      },
      nlSearch: {
        titel: "Fragen Sie nach Ihren Rechnungen",
        desc: "Stellen Sie Ihre Frage in eigenen Worten, getippt oder gesprochen.",
        v1: "Was haben wir diesen Monat für Reparaturen bezahlt?",
        v2: "Offene Rechnungen über 10.000 € anzeigen",
        v3: "Alle Rechnungen von Apaleo finden",
        placeholder: "z. B. Was haben wir dieses Jahr für Gerüstbau bezahlt?",
        // Shown below `sm`. The box reserves about 112px on the right for its three buttons, so on
        // a phone the long example does not fit on one line, and a placeholder cannot be wrapped
        // half-visibly without looking broken.
        placeholderKurz: "z. B. Gerüstbau-Kosten?",
        einfach: "Einfache Suche",
        einfachPlatzhalter: "Belege durchsuchen…",
        aiButton: "KI-Suche",
        normalSearch: "Normale Suche",
        treffer: "{{count}} passende Belege werden unten angezeigt.",
        keineTreffer: "Keine Belege passen zu Ihrer Suche.",
        nichtAngewendet: "Nicht berücksichtigt: {{aspects}}",
        applied: "{{count}} passende Belege werden unten angezeigt: Belege, die {{clauses}}.",
        appliedAnd: " und ",
        clauseCompany: "zu {{value}} gehören",
        clauseSupplier: "von {{value}} stammen",
        clauseProperty: "zum Objekt {{value}} gehören",
        clauseCategory: "in der Kategorie {{value}} liegen",
        clauseNoCompany: "keiner Gesellschaft zugeordnet sind",
        clausePaid: "bezahlt sind",
        clauseOpen: "noch offen sind",
        clauseOverdue: "überfällig sind",
        clauseReviewNeeded: "geprüft werden müssen",
        clauseReviewClear: "keine Prüfung brauchen",
        clauseBankAny: "einen Bankabgleich haben",
        clauseBankMatched: "einen bestätigten Bankabgleich haben",
        clauseBankSuggested: "einen vorgeschlagenen Bankabgleich haben",
        clauseBankUnmatched: "keinen Bankabgleich haben",
        clauseDocInvoice: "Rechnungen sind",
        clauseDocCreditNote: "Gutschriften sind",
        clauseDocOther: "sonstige Belege sind",
        clauseWorkflow: "im Schritt {{value}} stehen",
        clauseDatevDone: "an DATEV übergeben sind",
        clauseDatevPending: "noch nicht an DATEV übergeben sind",
        clauseLightGreen: "eine grüne Ampel haben",
        clauseLightYellow: "eine gelbe Ampel haben",
        clauseLightRed: "eine rote Ampel haben",
        clauseLightFlagged: "eine auffällige Ampel haben",
        clauseArchived: "archiviert sind",
        clauseInvoiceMonth: "im {{value}} datiert sind, egal in welchem Jahr",
        clauseDueMonth: "im {{value}} fällig sind, egal in welchem Jahr",
        clauseInvoiceDateRange: "zwischen {{from}} und {{to}} datiert sind",
        clauseInvoiceDateFrom: "ab {{from}} datiert sind",
        clauseInvoiceDateTo: "bis {{to}} datiert sind",
        clauseDueDateRange: "zwischen {{from}} und {{to}} fällig sind",
        clauseDueDateFrom: "ab {{from}} fällig sind",
        clauseDueDateTo: "bis {{to}} fällig sind",
        clauseAmountRange: "einen Bruttobetrag zwischen {{from}} und {{to}} haben",
        clauseAmountMin: "einen Bruttobetrag ab {{from}} haben",
        clauseAmountMax: "einen Bruttobetrag bis {{to}} haben",
        clauseDirectDebit: "per Lastschrift eingezogen werden",
        clauseNoDirectDebit: "nicht per Lastschrift eingezogen werden",
        searching: "KI-Suche läuft …",
        error: "Die KI-Suche ist fehlgeschlagen. Bitte erneut versuchen.",
        clear: "Zurücksetzen",
        submit: "Senden",
        voiceStart: "Spracheingabe starten",
        voiceStop: "Aufnahme beenden",
        voiceRecording: "Aufnahme läuft …",
        voiceTranscribing: "Wird transkribiert …",
        voiceModalTitle: "Spracheingabe",
        voiceModalHint: "Sprechen Sie Ihre Frage. Die Aufnahme läuft, bis Sie sie beenden.",
        voiceError: "Spracherkennung fehlgeschlagen. Bitte erneut versuchen.",
        gekuerzt: "Zeigt {{shown}} von {{total}} passenden Belegen.",
        gekuerztAehnlich: "Zeigt die {{shown}} ähnlichsten von {{total}} Belegen.",
        aggregatHinweis:
          "Diese Summe wurde über alle passenden Belege berechnet. Die Liste unten ist deshalb nicht auf sie eingegrenzt.",
        offTopic: "Ich kann nur Fragen zu Ihren Rechnungen beantworten.",
        sqlToggle: "Abfrage anzeigen",
      },
      filter: {
        gesellschaft: "Gesellschaft",
        alleGesellschaften: "Alle Gesellschaften",
        ohneGesellschaft: "Ohne Gesellschaft",
        ohneGesellschaftStrip_one:
          "{{count}} Rechnung hat noch keine Gesellschaft. Ohne sie geht es nicht weiter.",
        ohneGesellschaftStrip_other:
          "{{count}} Rechnungen haben noch keine Gesellschaft. Ohne sie geht es nicht weiter.",
        ohneGesellschaftZuweisen: "Jetzt zuweisen",
        ohneGesellschaftChip_one: "{{count}} Beleg ohne Gesellschaft",
        ohneGesellschaftChip_other: "{{count}} Belege ohne Gesellschaft",
        ohneGesellschaftAnzeigen: "anzeigen",
        ohneGesellschaftAktiv: "wird angezeigt",
        objekt: "Objekt",
        alleObjekte: "Alle Objekte",
        ohneObjekt: "Ohne Objekt",
        // NAMED AFTER THE COLUMN IT FILTERS ("KI & Prüfung"). It used to be called "Status", which
        // matched no column header on the screen: someone filtering by it had to work out for
        // themselves that the values land in the KI-&-Prüfung column, and "Status" also reads like
        // the workflow or the payment state, which are two other columns entirely.
        status: "Prüfung",
        alleStatus: "Alle (Prüfung)",
        workflow: "Workflow-Status",
        alleWorkflow: "Alle Workflow-Status",
        belegart: "Belegart",
        alleBelegarten: "Alle Belegarten",
        zahlung: "Geld",
        alleZahlungen: "Alle Zahlungen",
        zahlungsart: "Zahlungsart",
        alleZahlungsarten: "Alle Zahlungsarten",
        zahlungsartWert: {
          direct_debit: "Lastschrift",
          transfer: "Überweisung",
        },
        faellig: "Fällig",
        alleFaellig: "Alle Fälligkeiten",
        anwenden: "Anwenden",
        datev: "DATEV-Übergabe",
        alleDatev: "Alle (DATEV)",
        datevUebergeben: "Übergeben",
        datevOffen: "Offen",
        bankMatch: "Bank-Abgleich",
        alleBankMatch: "Alle (Abgleich)",
        ampel: "Erkennung",
        alleAmpeln: "Alle Erkennungen",
        ampelAuffaellig: "Auffällig (gelb & rot)",
        archiv: "Archiv",
        archivTitle:
          "Archivierte Belege anzeigen. Falsch eingesammelte Belege werden nie gelöscht, sondern hierhin verschoben.",
        zeitraum: "Zeitraum",
        zeitraumWaehlen: "Zeitraum wählen",
        zeitraumZuruecksetzen: "Zurücksetzen",
        zeitraumAnwenden: "Übernehmen",
        monatZurueck: "Voriger Monat",
        monatVor: "Nächster Monat",
        zweitesDatum: "Zweites Datum wählen",
        gesamterZeitraum: "Gesamter Zeitraum",
        jahr: "Jahr {{year}}",
        quartal: "Q{{quartal}} {{year}}",
        individuell: "Individueller Zeitraum …",
        letzte30Tage: "Letzte 30 Tage",
        von: "Von",
        bis: "Bis",
        reset: "Alle zurücksetzen",
        remove: "Filter entfernen",
        weitere: "Filter",
      },
      view: { liste: "Liste", kanban: "Kanban" },
      sort: {
        pruefPrioritaet: "Prüf-Priorität",
        pruefPrioritaetTitle: "Belege mit den meisten Prüf-Hinweisen zuerst",
      },
      count_one: "{{count}} Beleg",
      count_other: "{{count}} Belege",
      updating: "aktualisiere …",
      col: {
        steller: "Lieferant",
        naechsteAktion: "Nächste Aktion",
        gesellschaft: "Gesellschaft",
        objekt: "Objekt",
        betrag: "Betrag",
        ust: "USt",
        rechnungsdatum: "Rechnungsdatum",
        faellig: "Fällig",
        faelligAm: "fällig {{datum}}",
        leistung: "Leistung",
        eingang: "Eingang",
        // The time half of the Eingegangen cell, on its own line under the date.
        umZeit: "um {{zeit}}",
        kanal: "Kanal",
        konfidenz: "KI-Erkennung",
        konfidenzHint:
          'Wie sicher die KI die Felder vom Beleg gelesen hat. Sagt nichts darüber, ob Gesellschaft und Objekt schon zugeordnet sind, deshalb kann hier 100 % stehen und daneben trotzdem "Zu prüfen".',
        // The confidence percentage moved to its own column (col.konfidenz), so this one is just
        // the review state now.
        status: "Prüfung",
        // Not "Workflow": the word was identical in both dictionaries, so switching the
        // language left this header looking untranslated.
        workflow: "Workflow-Status",
        zahlung: "Zahlung",
        // Both badges under one label on the mobile card, where they have no column header.
        zahlungAbgleich: "Zahlung & Bank-Abgleich",
        datev: "DATEV",
        bankAbgleich: "Bank-Abgleich",
      },
      row: {
        nr: "Nr. {{nr}}",
        ohneNr: "ohne Nr.",
        // Resolved from the company plus the property, never stored on the receipt itself.
        kostenstelle: "Kostenstelle {{nr}}",
        kostenstelleFehlt: "Kostenstelle fehlt",
      },
      empty: "Keine Belege für die aktuelle Auswahl.",
      loading: "Lädt …",
      backendMissing:
        "Die Belegliste lässt sich gerade nicht laden. Das liegt an der Datenbank, nicht an Ihren Belegen. Es geht nichts verloren, bitte informieren Sie den technischen Support.",
      backendMissingTechnisch:
        "Hinweis für den Support: Die Listenansicht der Belege fehlt in der Datenbank (Migration 0042).",
      pagination: {
        perPage: "Pro Seite",
        showing: "Zeige {{from}}–{{to}} von {{total}}",
        page: "Seite {{page}} von {{pages}}",
        prev: "Zurück",
        next: "Weiter",
      },
      kanban: {
        laedtMehr: "Weitere Belege werden geladen …",
        empty: "leer",
        col: {
          eingegangen: { label: "Eingegangen", subtitle: "neu" },
          in_pruefung: { label: "In Prüfung", subtitle: "Assistenz prüft" },
          rueckfrage: { label: "Rückfrage", subtitle: "Klärung offen" },
          freigegeben_assistenz: {
            label: "Beim Vorgesetzten",
            subtitle: "wartet auf Freigabe",
          },
          freigegeben_vorgesetzter: { label: "Freigegeben", subtitle: "wartet auf Zahlung" },
          // Follows belege.workflow.bezahlt, which is no longer "Bezahlt": that word belongs to the
          // payment column, this one is the approval chain's payment step.
          bezahlt: { label: "Bezahlt", subtitle: "wartet auf DATEV" },
          // Same rename as belege.workflow.uebergeben_datev, so the board and the list agree.
          uebergeben_datev: { label: "Bei DATEV", subtitle: "wartet auf Abschluss" },
          abgeschlossen: { label: "Abgeschlossen", subtitle: "" },
        },
      },
    },

    detail: {
      // Einzeilige Labels für Freigabe-Verlauf und "Dauer je Stufe" — benannt nach dem ZUSTAND,
      // den der Beleg erreicht hat, nicht nach dem Ereignis. Bewusst getrennt von
      // `belege.workflow.<status>` (Leiter und Belegliste), wo ein Substantiv wie "In Prüfung"
      // richtig ist: eine Verlaufszeile liest sich als Protokoll einer Handlung.
      historie: {
        pruefungBehoben: "Prüfung behoben: {{pruefung}}",
        pruefungZurueck: "Prüfung wieder offen: {{pruefung}}",
        eingegangen: "Eingegangen",
        in_pruefung: "Zur Prüfung gegeben",
        rueckfrage: "Zur Prüfung gegeben",
        freigegeben_assistenz: "Freigegeben als Assistenz",
        freigegeben_stufe2: "Freigegeben als Stufe 2",
        freigegeben_vorgesetzter: "Freigegeben als Vorgesetzter",
        bezahlt: "Bezahlt",
        uebergeben_datev: "An DATEV übergeben",
        abgeschlossen: "Abgeschlossen",
        abgelehnt: "Abgelehnt",
        nicht_relevant: "Als nicht relevant markiert",
        korrigiert: "Status manuell korrigiert",
        zuordnungGetrennt: "Zuordnung getrennt",
        zuordnungBestaetigt: "Bankabgleich bestätigt",
        event: {
          paidFromMatch: "Als bezahlt markiert, bestätigter Bankabgleich",
          matchConfirmed: "Banktransaktion zugeordnet",
          matchRejected: "Zuordnungsvorschlag abgelehnt",
          matchRejectedGrund: "Zuordnungsvorschlag abgelehnt: {{grund}}",
          matchUnlinked: "Zuordnung zur Banktransaktion getrennt",
          matchUnlinkedGrund: "Zuordnung zur Banktransaktion getrennt: {{grund}}",
          remainderWrittenOff: "Restbetrag abgeschrieben, Rechnung gilt als bezahlt",
          remainderReopened: "Restabschreibung zurückgenommen, Rechnung wieder offen",
          remainderWrittenOffGrund:
            "Restbetrag abgeschrieben, Rechnung gilt als bezahlt: {{grund}}",
          paidFromMatchSkonto:
            "Als bezahlt markiert, bestätigter Bankabgleich, Skonto {{skonto}} EUR",
          paymentWithdrawn:
            "Zahlung zurückgenommen: der Bankabgleich deckt nur noch {{matched}} von {{gross}} EUR",
        },
        // WIE bezahlt wurde, in Klammern hinter "Bezahlt".
        bezahltVia: {
          manual: "manuell markiert",
          bank_match: "Bankabgleich bestätigt",
          banksapi_payment: "per BANKSapi überwiesen",
        },
        rueckfrageZusatz: "Rückfrage gestellt",
      },
      rueckfrageOffen: "Zu diesem Beleg ist eine Rückfrage offen, im Workflow-Verlauf-Tab prüfen",
      betraege: {
        abzugsfaehig: "Vorsteuer zu {{prozent}} % abzugsfähig",
        abzugUnbestimmt: "Abzugsfähigkeit noch nicht bestimmt",
      },
      eingabe: {
        titel: "Braucht deine Eingabe",
        offen_one: "{{count}} offen",
        offen_other: "{{count}} offen",
        gesellschaftWaehlen: "Gesellschaft wählen",
        gesellschaftFolge: "Ohne Gesellschaft taucht der Beleg in keiner Auswertung auf.",
        keine: "Keine",
        keineWahl: "Keine, trifft nicht zu",
        keineWahlProtokoll: "{{feld}}: manuell auf „keine“ gesetzt",
        objektWaehlen: "Objekt wählen",
        kategorieWaehlen: "Kategorie wählen",
        objektFolge: "Kein Objektcode erkannt.",
        kategorieFolge: "Sonst „Nicht zugeordnet“ in der Kostenanalyse.",
      },
      keineAktionen: {
        keinRecht:
          "Ihnen fehlt das Recht „Rechnungen freigeben“. Ein Administrator kann es unter Team & Rollen erteilen.",
        keinRechtPerson:
          "{{namen}} hat nicht das Recht „Rechnungen freigeben“ und sieht hier deshalb keine Schritte.",
        keinFreigeber:
          "Sie handeln als Super Admin und stehen damit außerhalb der Freigabe-Kette. Wählen Sie oben eine Person, um deren Schritte zu sehen.",
        regelOhneFreigeber:
          "Für diesen Beleg greift eine Freigaberegel, in der kein Freigeber hinterlegt ist. Ein Administrator muss die Regel unter Freigaberegeln ergänzen.",
        nichtImRegelwerk:
          "Für diesen Beleg sind {{namen}} als Freigeber hinterlegt. Nur diese Personen können ihn freigeben. Ein Administrator kann Ihnen den Beleg zuweisen, dann können Sie ihn ebenfalls bearbeiten.",
        andererSchritt:
          "Sie sind für diesen Beleg hinterlegt, aber der nächste Schritt liegt gerade nicht bei Ihnen ({{namen}}).",
        abgeschlossen: "Der Freigabelauf für diesen Beleg ist abgeschlossen.",
        keineSchritte: "Für Sie ist hier gerade kein Schritt möglich.",
      },
      stufenNav: {
        korrektur: "Status auf diesen Schritt setzen",
        aria: "Freigabelauf",
        tooltip: "Klicken, um zu „{{stufe}}“ zu wechseln",
        // One sentence per step, saying what the click DOES. The generic
        // "move to X" above stays as the fallback for a step with no wording yet.
        klick: {
          in_pruefung: "Klicken, um den Beleg zur Prüfung zu geben.",
          freigegeben_assistenz:
            "Klicken, um den Beleg als von der Assistenz freigegeben zu markieren.",
          freigegeben_stufe2: "Klicken, um den Beleg als in Stufe 2 freigegeben zu markieren.",
          freigegeben_vorgesetzter:
            "Klicken, um den Beleg als vom Vorgesetzten freigegeben zu markieren.",
          abgeschlossen: "Klicken, um den Beleg abzuschließen.",
        },
        datevLink: "Klicken, um die DATEV-Übergabe zu öffnen",
        gesperrt: {
          // The last three steps are all unclickable, for three different reasons. One shared
          // sentence for all of them explained none of them.
          stufe: {
            bezahlt:
              "Diesen Schritt setzt das System selbst, sobald die Zahlung für diesen Beleg bestätigt ist.",
            uebergeben_datev:
              "Diesen Schritt setzt das System selbst, sobald die DATEV-Übergabe für diesen Beleg bestätigt ist.",
            // Both quoted names must match what the UI actually shows in THIS language: the
            // control is "Status korrigieren", and the tab it sits on is labelled "Workflow" in
            // both dictionaries (its route value is `freigabe`, which nobody sees).
          },
          automatisch:
            "Diesen Schritt setzt das System automatisch, sobald die Zahlung oder die DATEV-Übergabe bestätigt ist.",
          // What is MISSING, as the event that is missing. "Erst möglich, wenn der Beleg bei
          // „Freigegeben (Assistenz)“ angekommen ist" was accurate and clumsy; naming the act
          // says the same thing in the words the reader would use.
          // Who may act, when this reader may never act at all. Beats the "what has to happen
          // first" sentences below, which otherwise describe a step that unlocks for somebody else.
          nurVorgesetzter: "Diesen Schritt gibt nur ein Vorgesetzter frei.",
          abschluss:
            "Diesen Schritt setzt ein Vorgesetzter, sobald der Beleg an DATEV übergeben ist.",
          nurFreigeber: "Diesen Schritt kann nur {{name}} freigeben.",
          voraussetzung: {
            in_pruefung: "Erst möglich, wenn der Beleg zur Prüfung gegeben wurde.",
            freigegeben_assistenz: "Erst möglich, wenn der Beleg in Prüfung ist.",
            freigegeben_vorgesetzter:
              "Erst möglich, wenn der Beleg von der Assistenz freigegeben wurde.",
            abgeschlossen: "Erst möglich, wenn der Beleg an DATEV übergeben wurde.",
          },
          spaeter: "Erst möglich, wenn der Beleg bei „{{stufe}}“ angekommen ist.",
          uebersprungen: "Ihr nächster Schritt führt direkt zu „{{stufe}}“ und überspringt diesen.",
          nichtErlaubt: "Sie können den Beleg gerade nicht auf diesen Schritt setzen.",
        },
      },
      abgleichTip: {
        offen: "Noch keine Banktransaktion zugeordnet.",
        vorgeschlagen: "Ein Abgleich wurde vorgeschlagen und wartet auf Ihre Bestätigung.",
        teilweise:
          "Teilweise abgeglichen: die zugeordneten Buchungen decken den Betrag noch nicht.",
        abgeglichen: "Vollständig mit einer Banktransaktion abgeglichen.",
        oeffnen: "Klicken, um Zahlung & Abgleich zu öffnen",
      },
      tip: {
        reviewAlleBestanden_one: "Die eine Prüfung ist bestanden",
        reviewAlleBestanden_other: "Alle {{count}} Prüfungen bestanden",
        lieferant: "Lieferant",
        rechnungssteller: "Rechnungssteller (nicht verknüpft)",
        rechnungsnummer: "Rechnungsnummer",
        gesellschaft: "Gesellschaft",
        brutto: "Bruttobetrag",
        ustSatz: "USt-Satz",
        reviewBefund_one: "{{count}} Prüfung fehlgeschlagen",
        reviewBefund_other: "{{count}} Prüfungen fehlgeschlagen",
        reviewOhneBefund: "Alle Prüfungen bestanden",
        reviewOeffnen: "Klicken, um die Prüfkarte zu öffnen",
        abgleich: "Bankabgleich",
      },
      vorheriger: "Vorheriger Beleg",
      naechster: "Nächster Beleg",
      ustSatzKurz: "USt {{satz}} %",
      seit: {
        heute: "heute",
        gestern: "gestern",
        vorTagen: "vor {{tage}} Tagen",
      },
      faellig: {
        ueberfaelligKurz: "{{tage}} Tage überfällig",
        ueberfaelligJahre: "{{jahre}} J. überfällig",
        ueberfaelligJahreMonate: "{{jahre}} J. {{monate}} Mon. überfällig",
        am: "Fällig {{datum}}",
        ueberfaellig: "Fällig {{datum}}, {{tage}} Tage überfällig",
      },
      ungespeichert: {
        title: "Änderungen verwerfen?",
        // Nennt die Felder: „Bist du sicher?" beantwortet niemand informiert, eine Liste schon.
        body: "{{count}} bearbeitete(s) Feld(er) ist/sind noch nicht gespeichert: {{felder}}. Beim Verlassen gehen diese Eingaben verloren.",
        weiter: "Weiter bearbeiten",
        verwerfen: "Änderungen verwerfen",
      },
      notFoundTitle: "Beleg nicht gefunden",
      notFoundBody: "Der Beleg {{nr}} existiert nicht (mehr).",
      toOverview: "Zur Übersicht",
      back: "Eingangsrechnungen",
      unknownSteller: "Unbekannter Steller",
      openSupplierTitle: "{{name}}: Stammdaten öffnen",
      ohneNr: "ohne Nr.",

      // Original-document preview (left column). File names / OCR are never translated.
      preview: {
        loadError: "Original konnte nicht geladen werden.",
        none: "Kein Original hinterlegt.",
        newTab: "Neuer Tab",
        zoom: "Großansicht (zoomen)",
        enlarge: "Großansicht",
        enlargeAria: "Beleg vergrößern",
        unavailable: "Vorschau für {{type}} nicht verfügbar.",
        thisFileType: "diesen Dateityp",
        pleaseDownload: "Bitte herunterladen.",
        download: "Original herunterladen",
      },

      workflow: {
        grund: "Grund",
        heading: "Workflow",
        statusLabel: "Status (Freigabe-Kette)",
        assignedTo: "Zugewiesen an",
        nobody: "(niemand)",
        alsSuperAdmin: "Super Admin",
        bezahltManuell: "Bezahlt (manuell)",
        bezahltManuellHint:
          "Normalerweise wird ein Beleg über den bestätigten Bankabgleich automatisch als bezahlt markiert. Diese manuelle Markierung nur für Zahlungen ohne Bankabgleich verwenden.",
        actingAs: "Handelnd als {{name}}",
        actingAsChoose: "Handeln als",
        commentRequired: "Bitte einen Kommentar hinzufügen.",
        abbrechen: "Abbrechen",
        bestaetigen: "Bestätigen",
        overdue: "{{name}} ist seit {{days}} Tagen ohne Rückmeldung überfällig.",
        overdueDeputy: "Vertretung: {{name}}.",
        verantwortlich: "Verantwortlich: {{name}}",
        verantwortlicherInaktiv:
          "Verantwortlicher {{name}} ist deaktiviert. Bitte unter „Team & Rollen“ reaktivieren oder die Freigabe-Regel anpassen.",
        unbekannt: "Unbekannte Person",
        dauerKurz: {
          minuten_one: "{{count}} Min.",
          minuten_other: "{{count}} Min.",
          stunden_one: "{{count}} Std.",
          stunden_other: "{{count}} Std.",
          tage_one: "{{count}} Tag",
          tage_other: "{{count}} Tage",
        },
        dauer: {
          minuten_one: "{{count}} Minute",
          minuten_other: "{{count}} Minuten",
          stunden_one: "{{count}} Stunde",
          stunden_other: "{{count}} Stunden",
          tage_one: "{{count}} Tag",
          tage_other: "{{count}} Tage",
        },
        rueckfrageAn: "an {{name}}",
        handelndAls: "handelnd als {{name}}",
        verlaufEmpty: "Noch keine Einträge im Freigabe-Verlauf.",
        rueckfragenEmpty: "Noch keine Rückfragen.",
        korrektur: {
          grundLabel: "Grund",
          grundPlatzhalter: "Warum wird die Zahlung zurückgenommen?",
          loestZahlung_one:
            "Damit wird auch die bestätigte Banktransaktion vom Beleg getrennt. Sie steht danach wieder als Vorschlag bereit.",
          loestZahlung_other:
            "Damit werden auch die {{count}} bestätigten Banktransaktionen vom Beleg getrennt. Sie stehen danach wieder als Vorschlag bereit.",
          label: "Status korrigieren",
          hint: "Falls versehentlich der falsche Status gesetzt wurde. Dies übergeht die normale Freigabe-Kette.",
          waehlen: "Status wählen",
          title: "Status korrigieren?",
          desc: "Status wird manuell von „{{von}}“ auf „{{nach}}“ geändert, ohne die normalen Freigabe-Schritte zu durchlaufen.",
        },
        nebengleis: "Sonderstatus:",
        stepperLabel: "Freigabe-Fortschritt",
        stepOf: "Schritt {{step}} von {{total}}",
        stepCurrent: "aktuell",
        stepDone: "erledigt",
        stepTodo: "ausstehend",
        rueckfrageZweig:
          "Eine Rückfrage ist ein Abstecher: sie kann von jedem Freigabe-Schritt aus gestartet werden und kehrt danach zu diesem zurück.",
      },
      meta: {
        eingangskanal: "Eingangskanal",
        eingegangen: "Eingegangen",
        faellig: "Fällig",
        quelle: "Quelle",
        belegart: "Belegart",
        betreff: "Betreff",
        absender: "Absender",
        gesendetAm: "Gesendet am",
      },
      section: {
        steuerlicheBehandlung: "Steuerliche Behandlung",
        rechnungsinfo: "Rechnungsinformationen",
        betraege: "Beträge",
        rechnungsdaten: "Rechnungsdaten",
        leistungsdaten: "Leistung & Auftrag",
        beteiligte: "Rechnungssteller & Zuordnung",
        zuordnung: "Zuordnung",
        weitere: "Weitere Angaben",
        freigabe: "Freigabe",
        rueckfragen: "Rückfragen",
        freigabeVerlauf: "Workflow-Verlauf",
        stufenDauern: "Dauer je Schritt",
        zahlungAbgleich: "Zahlung & Abgleich",
        zahlungsstatus: "Zahlungsstatus",
        notizen: "Notizen & Verlauf",
        notizenNur: "Notizen",
        positionen: "Positionen",
        steuer: "USt-Aufschlüsselung",
        lieferant: "Verknüpfter Lieferant",
        eingang: "Eingang",
        rohdaten: "Alles vom Beleg",
        volltext: "Volltext (OCR)",
        email: "E-Mail",
        verarbeitung: "Verarbeitung (Pipeline)",
      },
      hint: {
        editing: "Bearbeiten aktiv",
        ampel: "Ampel = KI-Konfidenz je Feld",
      },
      rechteAnzahl: "{{n}} von {{gesamt}}",
      rechteAlle: "alle",
      tab: {
        uebersicht: "Übersicht",
        freigabe: "Workflow-Verlauf",
        zahlung: "Zahlung & Abgleich",
        details: "Details",
        lieferant: "Lieferant",
        verlauf: "Verlauf",
      },
      field: {
        gemeinkosten: "Gemeinkosten",
        kostenstelle: "Kostenstelle {{nr}}",
        // Nobody picks a cost centre on the invoice: it follows from the property and the company,
        // so a gap says which master data is missing and links there.
        kostenstelleFehlt:
          "Für dieses Objekt ist bei dieser Gesellschaft keine Kostenstellen-Nummer hinterlegt.",
        kostenstelleNichtZugeordnet:
          "Dieses Objekt ist der Gesellschaft nicht zugeordnet, daher keine Kostenstelle.",
        kostenstelleGemeinkostenFehlt:
          "Für diese Gesellschaft ist keine Gemeinkosten-Kostenstelle hinterlegt.",
        kostenstelleBeimObjekt: "Beim Objekt hinterlegen",
        kostenstelleZuordnen: "Beim Objekt zuordnen",
        kostenstelleBeiGesellschaft: "Bei der Gesellschaft hinterlegen",
        gemeinkostenNummer: "Kostenstelle Gemeinkosten {{nr}}",
        gemeinkostenNummerFehlt: "Keine Gemeinkosten-Kostenstelle hinterlegt.",
        rechnungsnummer: "Rechnungsnummer",
        auftragsnummer: "Auftragsnummer",
        rechnungsdatum: "Rechnungsdatum",
        faelligkeit: "Fälligkeitsdatum",
        leistungszeitraum: "Leistungszeitraum",
        leistungsdatum: "Leistungsdatum",
        leistungVon: "Leistung von",
        leistungBis: "Leistung bis",
        betragNetto: "Betrag netto",
        ustSatz: "USt-Satz",
        ustBetrag: "USt-Betrag",
        betragBrutto: "Betrag brutto",
        rechnungssteller: "Rechnungssteller",
        gesellschaft: "Gesellschaft",
        objekt: "Objekt",
        objektUnbekannt: "Nicht in den Objekten vorhanden. Neu anlegen?",
        objektUnbekanntKurz: "nicht angelegt",
        objektAnlegen: "Objekt anlegen",
        kategorie: "Kategorie",
        nurFreitext: "(nur Freitext)",
        freitextHinweis:
          "Noch nicht mit der Kategorieliste verknüpft. Zuordnungsregeln greifen auf diesen Text zu, die Kostenanalyse zählt ihn aber als „Nicht zugeordnet“.",
        verknuepfen: "Mit „{{name}}“ verknüpfen",
        ohneKategorieHinweis:
          "Nicht kategorisiert. Erscheint in der Kostenanalyse als „Nicht zugeordnet“.",
        anschriftSteller: "Anschrift Rechnungssteller",
        leistungsbeschreibung: "Leistungsbeschreibung",
        empfaenger: "Empfänger",
        kundennummer: "Kundennummer",
        zahlungsart: "Zahlungsart",
        verwendungszweck: "Verwendungszweck",
        empfaengerAnschrift: "Empfänger-Anschrift",
        steuerhinweis: "Steuerhinweis",
        waehrung: "Währung",
        gmailMessageId: "Gmail-Nachrichten-ID",
        stellerUstId: "USt-IdNr. (Rechnungssteller)",
        kleinbetrag: "Kleinbetrag",
        ohne: "(ohne)",
        ohneGesellschaftHinweis:
          "Keiner Gesellschaft zugeordnet. Der Beleg bleibt sichtbar und liegt im Sammelbestand, bis eine Gesellschaft gesetzt wird.",
        gesellschaftVorschlag: "Aus dem Objekt ergibt sich {{code}} als Gesellschaft.",
        gesellschaftUebernehmen: "Übernehmen",
        gesellschaftMehrdeutig:
          "Für dieses Objekt sind mehrere Gesellschaften hinterlegt. Bitte die richtige Gesellschaft manuell auswählen.",
        gesellschaftKeineZuordnung:
          "Für dieses Objekt ist keine Gesellschaft hinterlegt. Bitte auf der Objektseite ergänzen.",
        abzugsfaehigkeit: "Abzugsfähigkeit",
        abzugsfaehigerBetrag: "davon abzugsfähig",
        nichtAbzugsfaehigerBetrag: "davon nicht abzugsfähig",
        nichtBestimmt: "noch nicht bestimmt",
        sonderfall: "Steuerlicher Sonderfall",
        ustKonflikt:
          "Der USt-Status dieses Belegs hat sich gegenüber der zuvor ermittelten Einordnung geändert.",
        ustKonfliktVerstanden: "Verstanden",
        einkommensteuerBehandlung: "Herstellungs-/Erhaltungsaufwand",
      },
      vatSonderfall: {
        hospitality: "Bewirtung",
        partial: "Teilweise abzugsfähig",
        down_payment: "Anzahlung",
      },
      einkommensteuer: {
        herstellungsaufwand: "Herstellungsaufwand",
        erhaltungsaufwand: "Erhaltungsaufwand",
      },
      zuordnung: {
        reassignTitle: "Zuordnung ändern?",
        reassignDesc:
          "Dieser Beleg ist bereits zugeordnet. Die Änderung wird protokolliert. Fortfahren?",
        reassignConfirm: "Zuordnung ändern",
      },
      lastschrift: {
        bannerTitle: "Wird per Lastschrift eingezogen",
        bannerBody: "Dieser Beleg wird automatisch abgebucht. Bitte nicht zusätzlich überweisen.",
      },
      review: {
        duplikat: "Duplikat",
        beheben: "Beheben",
        // The card lists failed checks, so it is titled for what it lists. It no longer
        // asks why the receipt is in review: `invoices.status` is a different axis, and
        // the header badge answers that one.
        title: "Warum dieser Beleg zur Prüfung liegt",
        // The card's own all-clear. Deliberately NOT `none` ("Keine Prüfung nötig"), which
        // the status badge uses: an invoice can pass every check and still be waiting for
        // somebody to confirm it, and the two must not contradict each other on one screen.
        ohneBefund: "Keine Beanstandung",
        needed: "Zu prüfen",
        confirm: "Bestätigen",
        none: "Keine Prüfung nötig",
        pruefungen_one: "{{count}} Prüfung",
        pruefungen_other: "{{count}} Prüfungen",
        bestanden_one: "{{count}} weitere Prüfung bestanden",
        bestandenAlle_one: "{{count}} Prüfung bestanden",
        bestandenAlle_other: "{{count}} Prüfungen bestanden",
        bestanden_other: "{{count}} weitere Prüfungen bestanden",
        zumFeld: "Prüfen",
        waehlen: "Auswählen",
      },
      decision: {
        title: "Entscheidung",
      },
      // Kopfzeilen-Achsen — bewusst getrennt. KI-Konfidenz (wie sicher die Extraktion ist) und
      // Prüfung (muss ein Mensch draufschauen) sind UNTERSCHIEDLICHE Signale und getrennt dargestellt.
      felder: {
        alleZeigen: "Alle Felder anzeigen",
        wenigerZeigen: "Weniger Felder anzeigen",
      },
      stufen: {
        eingegangen: "Eingegangen",
        inPruefung: "In Prüfung",
        freigegeben: "Freigegeben",
        bezahlt: "Bezahlt",
        datev: "DATEV",
        abseits: "Nicht im Freigabelauf",
      },
      axis: {
        konfidenz: "KI-Konfidenz",
        review: "Prüfung",
        workflow: "Workflow-Status",
        zahlung: "Zahlung & Abgleich",
        workflowHint: "Wo dieser Beleg im Freigabe- und Zahlungsweg steht.",
        zahlungHint: "Ob er bezahlt ist, mit einer Bankbuchung abgeglichen und bereit für DATEV.",
      },
      konfidenz: {
        prozent: "KI-Konfidenz: {{prozent}} %",
        hint: "Wie sicher die KI ist, dass sie die Felder richtig gelesen hat. Das ist unabhängig von den Prüfungen. Ein Beleg kann sicher gelesen sein und trotzdem eine Prüfung brauchen.",
      },
      zahlung: {
        keineZahlBerechtigung:
          "Dafür fehlt Ihnen die Berechtigung. Zahlungen darf nur auslösen, wer dafür freigeschaltet ist.",
        bezahltTitle: "Als bezahlt markieren?",
        bezahltDesc:
          "Der Beleg gilt ab sofort als bezahlt, mit dem heutigen Datum und einem Eintrag im Verlauf. Diese Markierung nimmt der Bankabgleich nicht wieder zurück: Nur eine automatisch gesetzte Markierung wird zurückgenommen, eine manuelle bleibt bestehen. Bitte nur setzen, wenn die Zahlung tatsächlich erfolgt ist und im Bankabgleich nicht auftaucht.",
        bezahltConfirm: "Als bezahlt markieren",
        bezahltZurueckTitle: "Bezahlt-Markierung entfernen?",
        bezahltZurueckDesc:
          "Der Beleg gilt danach wieder als offen. Das Bezahlt-Datum wird gelöscht und der Vorgang im Verlauf festgehalten. Der Bankabgleich kann den Beleg anschließend wieder selbst als bezahlt markieren, sobald eine passende Buchung bestätigt ist.",
        bezahltZurueckConfirm: "Markierung entfernen",
        datevReady: "DATEV-bereit",
        grund: {
          lastschrift:
            "Wird automatisch per Lastschrift eingezogen, eine Überweisung ist nicht nötig",
          lastschrift_ausstehend:
            "Wird per Lastschrift eingezogen. Wartet auf die Bestätigung der Bank, eine Überweisung ist nicht nötig.",
          bezahlt: "Als bezahlt markiert",
          offen: "Noch offen. Noch nicht bezahlt.",
          abgeglichen: "Mit einer Bankbuchung abgeglichen",
          teilweise: "Teilweise mit Bankbuchungen abgeglichen",
          nicht_abgeglichen: "Noch keine passende Bankbuchung, es bleibt ein offener Posten",
          datev_bereit: "Bereit für DATEV. Abgeglichen und übergeben.",
          datev_offen: "Noch nicht an DATEV übergeben",
        },
      },
      notiz: {
        placeholder: "Notiz zum Beleg (z. B. Rücksprache, Klärung) …",
        save: "Notiz speichern",
        add: "Notiz hinzufügen",
        abbrechen: "Abbrechen",
        keine: "Es gibt keine Notizen zu dieser Rechnung.",
        weitere_one: "{{count}} weitere Notiz anzeigen",
        weitere_other: "{{count}} weitere Notizen anzeigen",
        empty: "Noch keine Notizen oder Änderungen.",
      },
      verlaufTyp: {
        zuordnung_getrennt: "Zuordnung getrennt",
        zuordnung_bestaetigt: "Bankabgleich bestätigt",
        notiz: "Notiz",
        statuswechsel: "Status",
        aenderung: "Änderung",
        zuweisung: "Zuweisung",
        zuordnung: "Zuordnung",
        loeschung: "Löschung",
        regel: "Regel",
        nicht_relevant: "Nicht relevant",
        archiviert: "Archiv",
        freigabe_pruefung: "Geprüft & freigegeben",
        freigabe_final: "Endgültig freigegeben",
        rueckfrage: "Rückfrage",
        ablehnung: "Abgelehnt",
        bereits_freigegeben: "Als bereits freigegeben markiert",
        uebersprungen: "Schritt übersprungen",
        korrektur: "Status manuell korrigiert",
        bezahlt: "Bezahlt",
        zahlung_fehlgeschlagen: "Zahlung fehlgeschlagen",
        uebergeben_datev: "An DATEV übergeben",
        abgeschlossen: "Beleg abgeschlossen",
      },
      actorSystem: "System",
      positionen: {
        beschreibung: "Beschreibung",
        menge: "Menge",
        einzelpreis: "Einzelpreis",
        ustProzent: "USt %",
        betrag: "Betrag",
        empty: "Keine Einzelpositionen erkannt.",
      },
      steuer: {
        satz: "Satz",
        netto: "Netto",
        ust: "USt",
        empty: "Keine USt-Aufschlüsselung hinterlegt.",
      },
      lieferant: {
        wechseln: "Anderer Lieferant",
        name: "Name",
        anschrift: "Anschrift",
        ustId: "USt-IdNr",
        iban: "IBAN",
        bic: "BIC",
        bank: "Bank",
        telefon: "Telefon",
        ansprechpartner: "Ansprechpartner",
        ueberweisung: "Überweisung",
        konten: {
          titel: "Bankkonten",
          zahlungHinweis: "Die Zahlung wird im Tab <tabLink>{{tab}}</tabLink> ausgelöst.",
          neuHinweis:
            "Diese IBAN ist neu für diesen Lieferanten. Sie stammt aus dieser Rechnung, bitte prüfen Sie sie, bevor Geld überwiesen wird.",
        },
        zahlkonto: {
          konto: "Zahlungskonto",
          standardHinweis:
            "Auf dieser Rechnung wurde keine IBAN gefunden. Angezeigt wird die Standard-IBAN des Lieferanten.",
          ausRechnung_one: "Bankverbindung auf dieser Rechnung",
          ausRechnung_other: "Bankverbindungen auf dieser Rechnung",
          neuBadge: "Neu",
          inVerwendung: "Wird verwendet",
          chip: {
            info: "Was wir über diese IBAN wissen",
            rechnung: "Aus der Rechnung",
            rechnungHinweis: "Diese IBAN steht so auf der Rechnung.",
            standard: "Standard",
            standardHinweis: "Dies ist die Standard-IBAN dieses Lieferanten.",
            manuell: "Weitere IBAN",
            manuellHinweis: "Dies ist eine weitere für diesen Lieferanten gespeicherte IBAN.",
          },
          hinzufuegen: "Bankverbindung hinzufügen",
          nachgetragenTitel:
            "Für diesen Lieferanten wurde inzwischen eine Bankverbindung hinterlegt.",
          verknuepfen: "Mit dieser Rechnung verknüpfen",
          verknuepft: "{{iban}} mit dieser Rechnung verknüpft.",
          leerTitel: "Kein Zahlungskonto verfügbar",
          leerNichts:
            "Auf dieser Rechnung wurde keine Bankverbindung gefunden und für diesen Lieferanten ist keine Standard-Bankverbindung gespeichert.",
          leerLesefehler:
            "Auf dieser Rechnung stand eine Bankverbindung, sie konnte aber nicht sicher gelesen werden. Bitte prüfen Sie das Dokument und tragen Sie die Bankverbindung ein.",
        },
        ueberweisungBlock: "Überweisungs-Block",
        betrag: "Betrag",
        verwendungszweck: "Verwendungszweck",
        rechnungPrefix: "Rechnung {{nr}}",
        verbucht: "Belege dieses Lieferanten",
        weitereKonten_one: "+{{count}} weiteres Konto",
        weitereKonten_other: "+{{count}} weitere Konten",
        belegeCount_one: "{{count}} Beleg",
        belegeCount_other: "{{count}} Belege",
        open: "Lieferanten-Stammdaten öffnen →",
        none: "Kein Lieferant verknüpft.",
        anschriftLautBeleg: " Anschrift laut Beleg: {{addr}}",
        auswahl: "Lieferant zuordnen",
        kein: "(kein Lieferant)",
        auswahlHint:
          "Falsch erkannt? Ordne den Beleg dem richtigen Lieferanten zu. Die Änderung wird protokolliert.",
        // "Jetzt bezahlen" (docs/BANKSAPI_PAYMENT_INITIATION.md, migration 0081) — trigger a real
        // BANKSapi payment. Ported from immonetz's implementation.
        zahlung: {
          jetztBezahlen: "Jetzt bezahlen",
          confirmTitle: "Zahlung auslösen?",
          confirmBody:
            "Es werden {{betrag}} an {{empfaenger}} überwiesen. Diese Aktion kann nicht rückgängig gemacht werden.",
          vonKonto: "Von Konto",
          zusammenfassung: "Diese Zahlung",
          neuesKonto: {
            hinzufuegen: "Neue Bankverbindung hinzufügen",
            speichern: "Bankverbindung speichern",
            ibanUngueltig: "Diese IBAN ist unvollständig oder ungültig.",
          },
          betragWeichtAb: "Weicht vom Rechnungsbetrag ab ({{betrag}}).",
          anKonto: "An Bankverbindung",
          kontoWaehlen: "Konto wählen",
          keineKonten: "Kein verbundenes BANKSapi-Konto für diese Gesellschaft gefunden.",
          deaktiviertGrund: {
            keinIban: "Kein gültiger IBAN für diesen Lieferanten hinterlegt.",
            nichtFreigegeben: "Die Rechnung muss zuerst durch den Vorgesetzten freigegeben werden.",
            bereitsBezahlt: "Die Rechnung ist bereits bezahlt.",
            selbstFreigegeben:
              "Sie haben diese Rechnung freigegeben. Die Zahlung muss eine zweite Person auslösen.",
            selbstFreigegebenFremd:
              "Der angemeldete Login hat diese Rechnung freigegeben. Die Zahlung muss eine zweite Person auslösen. Ein anderes „Handeln als“ ändert das nicht: geprüft wird der Login, nicht die gewählte Person.",
            lastschrift:
              "Diese Rechnung wird per Lastschrift eingezogen und darf nicht zusätzlich überwiesen werden.",
            offenerVersuch: "Es läuft bereits ein Zahlungsversuch für diese Rechnung.",
            keinKonto: "Kein verbundenes BANKSapi-Konto für diese Gesellschaft gefunden.",
            wirdGeladen: "Zahlungsdaten werden geladen …",
          },
          ibanGeaendert:
            "Achtung: Die IBAN dieses Lieferanten wurde kürzlich geändert. Bitte vor dem Auslösen sorgfältig prüfen.",
          bestaetigen: "Zahlung auslösen",
          ausgeloest: "Zahlung ausgelöst. Bitte im neuen Tab bei der Bank bestätigen.",
          sofortAusgefuehrt: "Zahlung ausgeführt.",
          sofortFehlgeschlagen: "Zahlung fehlgeschlagen: {{grund}}",
          webformOeffnen: "Zahlungsseite öffnen",
          attemptAbbrechen: "Zahlungsversuch abbrechen",
          abbrechenConfirmTitle: "Zahlungsversuch abbrechen?",
          abbrechenConfirmBody:
            "Der aktuelle Zahlungsversuch wird abgebrochen. Anschließend kann eine neue Zahlung ausgelöst werden.",
          abbrechenToast: "Zahlungsversuch abgebrochen.",
          status: "Zahlungsstatus",
          statusValue: {
            draft: "Wird vorbereitet",
            pending_sca: "Bestätigung bei der Bank ausstehend",
            authorized: "Freigegeben",
            executed: "Ausgeführt",
            failed: "Fehlgeschlagen",
            cancelled: "Abgebrochen",
          },
        },
      },
      volltextShow: "Volltext anzeigen",
      mailtextShow: "Mailtext anzeigen",
      rohdatenShow: "Alles anzeigen, was auf diesem Beleg gefunden wurde",
      rohdaten: {
        titel: "Alles, was auf diesem Beleg gefunden wurde",
        hinweis:
          "Jede Angabe, die beim Einlesen von diesem Beleg erkannt wurde. Tippen Sie einen Begriff ein, um danach zu suchen.",
        suchen: "Suchen, z. B. Bankverbindung oder 1.199,12",
        treffer: "{{n}} von {{gesamt}}",
        keineTreffer: "Keine Treffer",
        vorher: "Vorheriger Treffer",
        naechster: "Nächster Treffer",
      },
      verarbeitungEmpty: "Keine Verarbeitungs-Einträge.",
      abgleich: {
        trennen: "Trennen",
        trennenDialog: {
          title: "Zuordnung trennen?",
          desc: "Die Verknüpfung wird aufgehoben: Beleg und Transaktion gelten wieder als offen, und der Vorschlag bleibt bestehen und kann jederzeit erneut zugeordnet werden.",
          grundLabel: "Grund",
          grundPlaceholder: "Warum stimmt die Zuordnung nicht?",
          abbrechen: "Abbrechen",
          bestaetigen: "Trennen",
          laeuft: "Wird getrennt ...",
          unbekannterFehler: "Unbekannter Fehler.",
        },
        claimsPaidNudge:
          "Laut Rechnung per Lastschrift bezahlt, und eine passende Banktransaktion wurde gefunden. Bitte den Abgleich bestätigen. Erst dann gilt der Beleg als bezahlt.",
        empty:
          "Noch keine Banktransaktion zugeordnet. Der Abgleich läuft automatisch beim nächsten Bank-Sync.",
        transaktion: "Transaktion",
        ablehnen: "Ablehnen",
        zuordnen: "Zuordnen",
        // Sammel- und Teilzahlungen (Migration 0024): eine Verknüpfung trägt ihren eigenen Betrag.
        vonSumme: "{{zugeordnet}} von {{gesamt}}",
        restOffen: "{{rest}} offen",
        davon: "davon {{betrag}}",
      },
      action: {
        mehr: "Weitere Aktionen",
        linkKopieren: "Link zu diesem Beleg kopieren",
        linkKopiert: "Link kopiert. Er öffnet genau diesen Beleg.",
        verwerfen: "Kein Beleg, in den Papierkorb",
        verwerfenTitle: 'Als „kein Beleg" verwerfen?',
        verwerfenDesc:
          "Für Nicht-Rechnungen (Kontoauszug, Buchungsjournal, Fehl-Erkennung). Wird ausgeblendet, bleibt aber revisionssicher gespeichert (wiederherstellbar).",
        abbrechen: "Abbrechen",
        verwerfenConfirm: "Verwerfen",
        grundPlaceholder: "Grund (optional), z. B. Fehl-Upload",
        bearbeiten: "Bearbeiten",
        bearbeitenGesperrt: "Zuerst den offenen Abschnitt speichern oder abbrechen.",
        speichern: "Speichern",
        speichere: "Speichere …",
        nichtRelevant: "Nicht für uns, zurück ins Postfach",
        nichtRelevantTitle: "Als nicht relevant markieren?",
        nichtRelevantDesc:
          "Der Beleg fällt aus der Verarbeitung und wird zurück ins Postfach gegeben, damit er dort nicht verloren geht. Das Verschieben der E-Mail übernimmt die Ingest-Pipeline; bis dahin steht der Rückgabe-Hinweis auf „angefordert“.",
        nichtRelevantConfirm: "Nicht relevant",
        nichtRelevantOk: "Als nicht relevant markiert. Rückgabe ins Postfach angefordert.",
        nichtRelevantZurueck: "Wieder in die Verarbeitung aufnehmen",
        nichtRelevantZurueckOk: "Der Beleg ist wieder in der Prüfung.",
        archivieren: "Archivieren, fällt aus der Verarbeitung",
        archivierenTitle: "Falsch eingesammelten Beleg archivieren?",
        archivierenDesc:
          "Der Beleg verschwindet aus den Listen, wird aber nicht gelöscht. Der Hinweis geht an die zuständige Person: Wir archivieren das, bitte kümmere dich anderweitig darum, im System passiert damit nichts weiter.",
        archivierenConfirm: "Archivieren",
        archivierenOk: "Archiviert.",
        hinweisPlaceholder: "Warnhinweis, z. B. Rechnung gehört zu einem anderen Mandanten",
        archivZurueck: "Aus dem Archiv zurück in die Verarbeitung",
        archivZurueckOk: "Zurück aus dem Archiv.",
      },
      banner: {
        outgoing:
          "Ausgangsrechnung: gesendet von {{issuer}} (eine Ihrer eigenen Gesellschaften) an {{recipient}}",
        outgoingKurz: "Ausgangsrechnung",
        outgoingUnknownRecipient: "einen externen Kunden",
        archiviert: "Archiviert am {{date}} von {{by}}",
        archivHinweis: "Hinweis: {{note}}",
        archivOhneHinweis: "Es wurde kein Warnhinweis hinterlegt.",
        nichtRelevant: "Als nicht relevant markiert am {{date}} von {{by}}",
        nichtRelevantGrund: "Grund: {{note}}",
        postfachOffen:
          "Rückgabe ins Postfach ist angefordert, aber noch nicht bestätigt. Die E-Mail liegt bis dahin unverändert.",
        postfachZurueck: "Die E-Mail liegt seit {{date}} wieder im Postfach.",
      },
      regel: {
        anwenden: "Zuordnungsregeln anwenden",
        alsRegel: "Als Regel für diesen Lieferanten speichern",
        alsRegelUst: "{{satz}} % als USt-Regel speichern",
        gespeichert: "Regel gespeichert.",
        schonVorhanden:
          "Für diesen Geltungsbereich gibt es bereits eine Regel. Bitte in den Zuordnungsregeln anpassen.",
        keinLieferant: "Ohne Lieferant lässt sich keine Lieferanten-Regel ableiten.",
        keinWert: "Es ist kein Wert gesetzt, der als Regel gespeichert werden könnte.",
        angewendet:
          "{{count}} Feld(er) durch Regeln gesetzt, {{skipped}} von Hand gesetzte übersprungen.",
        nurUebersprungen:
          "Nichts geändert: {{count}} Feld(er) sind von Hand gesetzt und haben Vorrang.",
        keineTreffer: "Keine Regel greift für diesen Beleg.",
        fehlgeschlagen: "Fehlgeschlagen: {{error}}",
        regelGreift: "Eine Regel deckt dieses Feld ab.",
        regelUeberstimmt: "Eine Regel deckt dieses Feld ab, der Wert von Hand hat aber Vorrang.",
        konfliktGreift: "{{count}} Regeln passen. „{{gewinner}}“ gewinnt und wird angewendet.",
        konfliktUeberstimmt:
          "{{count}} Regeln passen. „{{gewinner}}“ würde gewinnen, der Wert von Hand hat aber Vorrang.",
      },
      standard: {
        schritt1: "Assistenz",
        schritt2: "Bereichsleitung",
      },
      toast: {
        zuordnungGetrennt: "Zuordnung getrennt.",
        gespeichert: "Gespeichert.",
        keineAenderungen: "Keine Änderungen.",
        ungueltigeZahl: 'Ungültige Zahl bei: {{fields}}. Bitte z. B. „1.234,56" eingeben.',
        statusGesetzt: "Status: {{label}}",
        zugewiesenAn: "Zugewiesen an {{name}}",
        zuweisungEntfernt: "Zuweisung entfernt",
        notizGespeichert: "Notiz gespeichert.",
        verworfen: "Verworfen, kein Beleg (wiederherstellbar).",
        zuordnungBestaetigt: "Zuordnung bestätigt.",
        zuordnungAbgelehnt: "Zuordnung abgelehnt.",
        speichernFehlgeschlagen: "Speichern fehlgeschlagen: {{error}}",
        fehlgeschlagen: "Fehlgeschlagen: {{error}}",
        verwerfenFehlgeschlagen: "Verwerfen fehlgeschlagen: {{error}}",
      },
    },
  },

  // Suppliers (Lieferanten) — list + detail pages.
  lieferanten: {
    list: {
      title: "Lieferanten",
      subtitle: "Kreditorenstamm aus der Pipeline: Basis für Überweisungen und Auswertungen.",
      search: "Lieferant oder Adresse suchen …",
      col: {
        name: "Lieferant",
        adresse: "Adresse",
        iban: "IBAN",
        ustId: "USt-IdNr",
        verbucht: "Belege",
        createdAt: "Erstellt",
        updatedAt: "Zuletzt aktualisiert",
      },
      belegeCount_one: "{{count}} Beleg",
      belegeCount_other: "{{count}} Belege",
      alleXTage: "alle {{tage}} Tage",
      empty: "Keine Lieferanten gefunden.",
      zeigeGeloeschte: "Gelöschte anzeigen",
      // The single "Filter" popover that replaced the loose switches next to the search field.
      filter: {
        button: "Filter",
        title: "Filter",
        reset: "Filter zurücksetzen",
        status: "Status",
        statusAlle: "Alle",
        statusAktiv: "Aktiv",
        statusGeloescht: "Gelöscht",
        adresse: "Adresse",
        ohneAdresse_one: "Ohne Adresse ({{count}})",
        ohneAdresse_other: "Ohne Adresse ({{count}})",
      },
      steuerId: {
        alleTitle: "Alle Kennungen in diesem Feld",
        weitere_one: "Eine weitere Kennung anzeigen",
        weitere_other: "{{count}} weitere Kennungen anzeigen",
        ustTitle: "Als USt-IdNr. erkannt.",
        steuernummerTitle: "Als Steuernummer erkannt, nicht als USt-IdNr.",
        steuernummerKurz: "St.-Nr.",
        unbekanntTitle:
          "Sieht wie eine USt-IdNr. aus, ist aber keine gültige. Bitte prüfen, bevor darauf vertraut wird.",
        andereTitle: "Andere Kennung (z. B. ausländische Steuernummer), keine USt-IdNr.",
      },
      geloescht: "gelöscht",
      mergeSuggestions: {
        title: "Vorschläge zum Zusammenführen",
        desc: "Diese Lieferanten könnten dieselbe Firma sein. Namen anklicken, um sie zu prüfen, dann zusammenführen.",
      },
      duplicates: {
        keyName: "Name",
        keyVatId: "USt-IdNr",
        keySteuernummer: "Steuernummer",
        matchedBy: "Übereinstimmung: {{key}} „{{value}}“",
        merge: "Zusammenführen",
      },
      neu: {
        stammdaten: "Stammdaten",
        bankHinweis:
          "Optional. Ohne Bankverbindung lässt sich der Lieferant anlegen, aber nicht bezahlen.",
        bankHinzufuegen: "Bank hinzufügen",
        bankEntfernen: "Bankverbindung entfernen",
        bankNummer: "Bankverbindung {{nummer}}",
        alsStandard: "Als Standard",
        ibanUngueltig: "Bitte eine vollständige IBAN eingeben.",
        button: "Neu",
        title: "Neuer Lieferant",
        desc: "Kreditor manuell anlegen. Nur der Name ist erforderlich.",
        cancel: "Abbrechen",
        anlegen: "Anlegen",
        anlege: "Lege an …",
      },
      toast: {
        namePflicht: "Name ist erforderlich.",
        angelegt: "Lieferant angelegt.",
        anlegenFehlgeschlagen: "Anlegen fehlgeschlagen: {{error}}",
      },
    },
    merge: {
      title: "„{{name}}“ zusammenführen",
      desc: "Wählen Sie den Lieferanten, der erhalten bleiben soll. Alle Belege, Regeln und die IBAN-Historie werden übernommen; „{{name}}“ wird danach ausgeblendet (wiederherstellbar) und als bekannte Schreibweise gespeichert.",
      placeholder: "Ziel-Lieferant wählen …",
      search: "Lieferant suchen …",
      empty: "Kein Lieferant gefunden.",
      action: "Zusammenführen …",
      confirm: {
        title: "Wirklich zusammenführen?",
        desc: "„{{von}}“ wird in „{{ziel}}“ zusammengeführt. Diese Aktion kann nicht direkt rückgängig gemacht werden.",
        cancel: "Abbrechen",
        confirm: "Zusammenführen",
      },
      toast: {
        erfolgreich: "„{{name}}“ wurde in „{{ziel}}“ zusammengeführt.",
        fehlgeschlagen: "Zusammenführen fehlgeschlagen: {{error}}",
      },
    },
    detail: {
      back: "Lieferanten",
      notFoundTitle: "Lieferant nicht gefunden",
      geloeschtBanner: "Dieser Lieferant wurde am {{datum}} gelöscht ({{grund}}).",
      geloeschtOhneGrund: "kein Grund angegeben",
      restore: {
        button: "Wiederherstellen",
        toast: "Lieferant wiederhergestellt.",
      },
      toList: "Zur Liste",
      editTitle: "Lieferant bearbeiten",
      editDesc: "Stammdaten & Bankverbindung bearbeiten.",
      section: {
        standardBankUnbrauchbar:
          "Auf dem Lieferanten steht „{{wert}}“. Das ist keine zahlbare IBAN, deshalb konnte daraus keine Bankverbindung angelegt werden. Bitte die richtige IBAN über „Bank hinzufügen“ erfassen.",
        standardBank: "Standard-Bankverbindung",
        standardBankLeer: "Für diesen Lieferanten ist keine Bankverbindung hinterlegt.",
        stammdaten: "Details",
        verbucht: "Belege",
        lastschrift: "Lastschrift",
        lastschriftHinweis:
          "Beobachtet aus den Zahlungsarten der Belege, kein hinterlegtes SEPA-Mandat.",
        aliases: "Bekannte Schreibweisen",
        bankkonten: "Bankverbindungen",
      },
      field: {
        name: "Name",
        adresse: "Adresse",
        ustId: "USt-IdNr",
        iban: "IBAN",
        ibanStandard: "IBAN (Standard)",
        bic: "BIC",
        bank: "Bank",
        telefon: "Telefon",
        email: "E-Mail",
        ansprechpartner: "Ansprechpartner",
      },
      gesamt: "Gesamt ({{count}} Belege)",
      frequenz: {
        label: "Häufigkeit",
      },
      col: {
        beleg: "Beleg",
        ges: "Ges.",
        datum: "Datum",
        betrag: "Betrag",
        status: "Status",
      },
      ohneNr: "ohne Nr.",
      belegeEmpty: "Noch keine Belege.",
      ibanVerlauf: {
        button: "Verlauf",
        title_one: "{{count}} Eintrag im Verlauf",
        title_other: "{{count}} Einträge im Verlauf",
        hinweis:
          "Aufgezeichnet werden neue Bankverbindungen und jeder Wechsel der Standard-Verbindung.",
        event: {
          account_added: "Bankverbindung hinzugefügt",
          default_set: "Als Standard gesetzt",
          default_changed: "Als Standard abgelöst",
        },
        akteurPipeline: "durch die Pipeline",
        akteurHub: "im Hub geändert",
        akteurUnbekannt: "Herkunft unbekannt",
      },
      lastschrift: {
        anzahl_one: "{{count}} Beleg per Lastschrift",
        anzahl_other: "{{count}} Belege per Lastschrift",
        empty: "Keine Lastschriften erfasst.",
      },
      aliases: {
        placeholder: "Neue Schreibweise …",
        hinzufuegen: "Hinzufügen",
        entfernen: "Entfernen",
        empty: "Keine bekannten Schreibweisen erfasst.",
        confirm: {
          title: "Schreibweise entfernen?",
          desc: "„{{alias}}“ wird nicht mehr als bekannte Schreibweise dieses Lieferanten geführt. Sie kann jederzeit erneut hinzugefügt werden.",
          cancel: "Abbrechen",
          confirm: "Entfernen",
        },
        toast: {
          hinzugefuegt: "Schreibweise „{{alias}}“ hinzugefügt.",
          entfernt: "Schreibweise „{{alias}}“ entfernt.",
          bereitsVorhanden: "Diese Schreibweise ist bereits erfasst.",
          fehlgeschlagen: "Hinzufügen fehlgeschlagen: {{error}}",
        },
      },
      bankkonten: {
        neu: {
          badge: "Neu",
          header: "Neue IBAN",
          headerHinweis:
            "Für diesen Lieferanten wurde eine neue Bankverbindung hinzugefügt. Bitte prüfen und bestätigen.",
          hinweis:
            "Diese Bankverbindung wurde aus einer Rechnung übernommen und war bei diesem Lieferanten bisher nicht hinterlegt. Bitte prüfen und bestätigen, bevor eine Zahlung ausgelöst wird.",
          bestaetigen: "Bankverbindung bestätigen",
          bestaetigt: "{{iban}} bestätigt.",
        },
        kopieren: "Bankverbindung kopieren",
        kopierenFehlgeschlagen: "Kopieren nicht möglich.",
        bearbeiten: "Bankverbindung bearbeiten",
        editDialog: {
          title: "Bankverbindung bearbeiten",
          speichern: "Speichern",
        },
        seit: "seit {{datum}}",
        col: {
          iban: "IBAN",
          bic: "BIC",
          bank: "Bank",
          quelle: "Herkunft",
        },
        dialog: {
          title: "Bankverbindung hinzufügen",
          abbrechen: "Abbrechen",
          speichern: "Hinzufügen",
        },
        hinzufuegen: "Hinzufügen",
        entfernen: "Entfernen",
        standard: "Standard",
        alsStandard: "Als Standard",
        empty: "Keine Bankverbindung erfasst.",
        inaktivTitle_one: "{{count}} deaktiviertes Konto",
        inaktivTitle_other: "{{count}} deaktivierte Konten",
        quelle: {
          pipeline: "automatisch erkannt",
          human: "manuell erfasst",
          backfill: "übernommen",
        },
        confirm: {
          desc: "„{{iban}}“ wandert in den Papierkorb. Von dort lässt sie sich wiederherstellen oder endgültig löschen.",
          title: "Bankverbindung entfernen?",
          cancel: "Abbrechen",
          confirm: "Entfernen",
        },
        toast: {
          gespeichert: "Bankverbindung {{iban}} gespeichert.",
          hinzugefuegt: "Bankverbindung „{{iban}}“ hinzugefügt.",
          entfernt: "Bankverbindung „{{iban}}“ entfernt.",
          standardGesetzt: "„{{iban}}“ ist jetzt die Standard-Bankverbindung.",
          bereitsVorhanden: "Diese IBAN ist bereits erfasst.",
          ungueltig: "Das ist keine vollständige IBAN. Bitte prüfen und erneut eingeben.",
          istStandard:
            "Die Standard-Bankverbindung kann nicht deaktiviert werden. Bitte zuerst eine andere als Standard setzen.",
          fehlgeschlagen: "Speichern fehlgeschlagen: {{error}}",
        },
      },
      merge: {
        button: "Zusammenführen",
      },
      regel: {
        button: "Regel anlegen",
      },
      delete: {
        button: "Löschen",
        title: "Lieferant löschen?",
        desc: "Wird ausgeblendet, bleibt aber revisionssicher gespeichert (wiederherstellbar). Verknüpfte Belege bleiben erhalten.",
        grundPlaceholder: "Grund (optional)",
        cancel: "Abbrechen",
        confirm: "Endgültig ausblenden",
      },
      action: {
        mehr: "Weitere Aktionen",
        bearbeiten: "Bearbeiten",
        abbrechen: "Abbrechen",
        speichern: "Speichern",
        speichere: "Speichere …",
      },
      toast: {
        gespeichert: "Gespeichert.",
        keineAenderungen: "Keine Änderungen.",
        geloescht: "Lieferant gelöscht (wiederherstellbar).",
        speichernFehlgeschlagen: "Speichern fehlgeschlagen: {{error}}",
        loeschenFehlgeschlagen: "Löschen fehlgeschlagen: {{error}}",
      },
    },
  },

  // Customers (Kunden) — Briefing Screen 15. Created directly here (migration 0086 removed the
  // LexOffice mirror); a customer is the basis for outgoing invoices.
  kunden: {
    // Field-level validation messages for the customer form. Each one names a fix, and the
    // formats carry an example: a rule you can act on beats a rule that only says "invalid".
    validierung: {
      gesellschaft: "Bitte eine Gesellschaft wählen.",
      name: "Bitte einen Namen eingeben, z. B. Muster GmbH.",
      strasse: "Bitte Straße und Hausnummer eingeben, z. B. Musterstraße 12.",
      plz: "Bitte eine gültige PLZ eingeben, z. B. 20095.",
      ort: "Bitte einen Ort eingeben, z. B. Hamburg.",
      email: "Bitte eine gültige E-Mail-Adresse eingeben, z. B. name@firma.de.",
    },
    list: {
      // Das Filter-Popover der Kundenliste.
      filter: {
        button: "Filter",
        title: "Kunden filtern",
        reset: "Filter zurücksetzen",
        gesellschaftAlle: "Alle Gesellschaften",
        nurUeberfaellig_one: "Nur überfällige ({{count}})",
        nurUeberfaellig_other: "Nur überfällige ({{count}})",
        ohneEmail_one: "{{count}} ohne E-Mail",
        ohneEmail_other: "{{count}} ohne E-Mail",
      },
      title: "Kunden",
      subtitle: "Rechnungsempfänger: Basis für Ausgangsrechnungen.",
      search: "Name, E-Mail oder Gesellschaft suchen …",
      col: {
        name: "Name",
        gesellschaft: "Gesellschaft",
        email: "E-Mail",
        rechnungen: "Rechnungen",
        betrag: "Betrag",
        ueberfaellig: "Überfällig",
      },
      empty: "Keine Kunden gefunden.",
      neu: {
        button: "Neu",
        title: "Neuer Kunde",
        desc: "Wird direkt hier angelegt.",
        gesellschaft: "Gesellschaft",
        gesellschaftPlaceholder: "Gesellschaft wählen …",
        istFirma: "Firma (nicht Privatperson)",
        cancel: "Abbrechen",
        anlegen: "Anlegen",
        anlege: "Lege an …",
      },
      toast: {
        formularUnvollstaendig: "Bitte die rot markierten Felder ausfüllen.",
        gesellschaftPflicht: "Gesellschaft ist erforderlich.",
        namePflicht: "Name ist erforderlich.",
        angelegt: "Kunde angelegt.",
        anlegenFehlgeschlagen: "Anlegen fehlgeschlagen: {{error}}",
      },
    },
    detail: {
      action: {
        mehr: "Weitere Aktionen",
      },
      // Placeholders on the customer form, so an empty field shows the shape of the answer.
      beispiel: {
        name: "Muster GmbH",
        strasse: "Musterstraße 12",
        plz: "20095",
        ort: "Hamburg",
        email: "name@firma.de",
      },
      back: "Kunden",
      notFoundTitle: "Kunde nicht gefunden",
      toList: "Zur Liste",
      // The customer row in this Hub IS the master record -- there is no LexOffice or sevDesk behind
      // it -- so edits simply stay here. Until the edit dialog existed this read "Stammdaten sind
      // hier nicht editierbar.", which meant a typo could never be corrected anywhere.
      editHinweis: "Stammdaten werden im Hub gepflegt. Änderungen wirken sofort.",
      edit: {
        button: "Bearbeiten",
        title: "Kunde bearbeiten",
        desc: "Änderungen werden direkt im Hub gespeichert.",
        cancel: "Abbrechen",
        speichern: "Speichern",
        speichere: "Speichert …",
        toast: {
          gespeichert: "Kunde gespeichert.",
          fehlgeschlagen: "Speichern fehlgeschlagen: {{error}}",
        },
      },
      section: {
        stammdaten: "Stammdaten",
        rechnungen: "Ausgangsrechnungen",
      },
      field: {
        erstellt: "Erstellt",
        aktualisiert: "Aktualisiert",
        name: "Name",
        gesellschaft: "Gesellschaft",
        ansprechpartner: "Ansprechpartner",
        adresse: "Adresse",
        strasse: "Straße",
        plz: "PLZ",
        ort: "Ort",
        kundennummer: "Kundennummer",
        ustId: "USt-IdNr",
        telefon: "Telefon",
        email: "E-Mail",
      },
      // Plural forms matter here now that cancellations/drafts are filtered out of the count: a
      // customer with one real invoice is common, and the single key read "1 Rechnungen".
      gesamt_one: "Gesamt ({{count}} Rechnung)",
      gesamt_other: "Gesamt ({{count}} Rechnungen)",
      nichtGezaehlt_one: "{{count}} stornierte oder Entwurfs-Rechnung nicht mitgezählt",
      nichtGezaehlt_other: "{{count}} stornierte oder Entwurfs-Rechnungen nicht mitgezählt",
      col: {
        nr: "Nr.",
        datum: "Datum",
        betrag: "Betrag",
        status: "Status",
      },
      entwurf: "Entwurf",
      rechnungenEmpty: "Noch keine Ausgangsrechnungen.",
      delete: {
        button: "Löschen",
        title: "Kunde löschen?",
        desc: "Wird hier ausgeblendet (wiederherstellbar).",
        grundPlaceholder: "Grund (optional)",
        cancel: "Abbrechen",
        confirm: "Endgültig ausblenden",
      },
      toast: {
        geloescht: "Kunde ausgeblendet.",
        loeschenFehlgeschlagen: "Löschen fehlgeschlagen: {{error}}",
      },
    },
  },

  // Companies (Gesellschaften) — list + detail pages.
  gesellschaften: {
    // Field-level validation for the company dialog, in the same shape as kunden.validierung.
    // Each message names a fix rather than only saying that something is wrong.
    validierung: {
      code: "Bitte einen Code eingeben, z. B. IMKO.",
      codeFormat: "Nur Buchstaben und Ziffern, ohne Leer- und Sonderzeichen.",
      codeLaenge: "Der Code darf höchstens 16 Zeichen lang sein.",
      name: "Bitte einen Namen eingeben, z. B. Muster GmbH.",
    },
    // companies.booking_basis decides which date puts an invoice into a period in the
    // Kostenanalyse (see use-bwa-scope.ts). It could only be changed in SQL until the company
    // detail page started offering it.
    buchungsbasis: {
      invoice_date: "Rechnungsdatum",
      payment_date: "Zahlungsdatum",
    },
    list: {
      title: "Gesellschaften",
      subtitle: "Gesellschaften, denen Rechnungen und Objekte zugeordnet werden.",
      search: "Code oder Name suchen …",
      archiviertBadge: "Archiviert",
      col: {
        code: "Code",
        name: "Name",
        bereich: "Bereich",
        objekte: "Objekte",
        verbucht: "Verbuchte Belege",
        createdAt: "Erstellt",
        updatedAt: "Aktualisiert",
      },
      objekteCount_one: "{{count}} Objekt",
      objekteCount_other: "{{count}} Objekte",
      belegeCount_one: "{{count}} Beleg",
      belegeCount_other: "{{count}} Belege",
      empty: "Keine Gesellschaften gefunden.",
      filter: {
        button: "Filter",
        title: "Filter",
        reset: "Zurücksetzen",
        status: "Status",
        statusAlle: "Alle",
        statusAktiv: "Aktiv",
        statusArchiviert: "Archiviert",
        bereich: "Bereich",
        bereichAlle: "Alle Bereiche",
        bereichOhne: "Ohne Bereich",
        ablage: "Dropbox-Ordner",
        ohneAblage: "Ohne Ordner ({{count}})",
      },
      neu: {
        button: "Neu",
        title: "Neue Gesellschaft",
        desc: "Kürzel (Code) und Name der Gesellschaft. Der Code muss eindeutig sein.",
        codeLabel: "Code",
        codePlaceholder: "z. B. ABCD",
        nameLabel: "Name",
        namePlaceholder: "Name der Gesellschaft",
        cancel: "Abbrechen",
        anlegen: "Anlegen",
        anlege: "Lege an …",
      },
      toast: {
        pflicht: "Code und Name sind erforderlich.",
        angelegt: "Gesellschaft angelegt.",
        anlegenFehlgeschlagen: "Anlegen fehlgeschlagen: {{error}}",
      },
    },
    detail: {
      archiv: {
        title: "Gesellschaft archivieren?",
        desc: "Die Gesellschaft verschwindet aus Listen und Auswahlfeldern. Bestehende Belege bleiben unverändert erhalten, und das Archivieren lässt sich jederzeit rückgängig machen.",
        mitBelegen_one: "Achtung: {{count}} Beleg ist dieser Gesellschaft zugeordnet.",
        mitBelegen_other: "Achtung: {{count}} Belege sind dieser Gesellschaft zugeordnet.",
        grundPlaceholder: "Grund (optional)",
        cancel: "Abbrechen",
        confirm: "Archivieren",
        banner: "Archiviert am {{datum}}. Grund: {{grund}}",
        ohneGrund: "kein Grund angegeben",
      },
      back: "Gesellschaften",
      notFoundTitle: "Gesellschaft nicht gefunden",
      toList: "Zur Liste",
      editTitle: "Gesellschaft bearbeiten",
      editDesc: "Stammdaten der Gesellschaft. Code und Name sind Pflicht.",
      section: {
        stammdaten: "Details",
        objekte: "Objekte",
        datev: "DATEV-Übergabe",
        verbucht: "Verbuchte Belege",
      },
      field: {
        code: "Code",
        name: "Name",
        // Area of responsibility for approval routing (migration 0087) -- see
        // docs/APPROVAL_ROUTING.md. Reuses freigabeRegeln.bereich.* for the value labels.
        bereich: "Zuständigkeitsbereich",
        buchungsbasis: "Buchungsbasis",
        buchungsbasisHinweis:
          "Nach diesem Datum ordnet die Kostenanalyse einen Beleg einer Periode zu. Ohne Angabe gilt das Zahlungsdatum.",
        gemeinkosten: "Kostenstelle Gemeinkosten",
        gemeinkostenFehlt: "Nicht hinterlegt",
        gemeinkostenPlatzhalter: "z. B. 10000",
        gemeinkostenHinweis:
          "Diese Nummer tragen alle Belege dieser Gesellschaft, die auf Gemeinkosten gebucht sind. Leer lassen, wenn es keine gibt.",
        gemeinkostenUngueltig: "Bitte eine positive ganze Zahl eingeben.",
        ablage: "Dropbox-Ordner",
        ablagePlaceholder: "Kein Ordner gewählt",
        ablageHinweis:
          "Belege dieser Gesellschaft werden hier abgelegt. Ohne Ordner wird nichts abgelegt.",
        erstellt: "Erstellt",
        aktualisiert: "Aktualisiert",
      },
      objekteHeading: "Objekte",
      objekteEmpty: "Dieser Gesellschaft ist noch kein Objekt zugeordnet.",
      objektHinzufuegen: "Objekt hinzufügen",
      objektEntfernen: {
        aktion: "{{objekt}} von dieser Gesellschaft entfernen",
        titel: "Objekt von der Gesellschaft entfernen?",
        beschreibung:
          "{{objekt}} gehört danach nicht mehr zu {{gesellschaft}}. Bereits gebuchte Belege bleiben unverändert, und die Zuordnung lässt sich beim Objekt wieder hinzufügen.",
        letzte:
          "{{objekt}} gehört nur zu {{gesellschaft}}. Ein Objekt braucht mindestens eine Gesellschaft. Ordne es zuerst beim Objekt einer anderen Gesellschaft zu.",
        bestaetigen: "Entfernen",
        erfolg: "{{objekt}} wurde von der Gesellschaft entfernt",
      },
      objekteLink: "Objekte",
      objekteCount_one: "{{count}} Objekt",
      objekteCount_other: "{{count}} Objekte",
      datevLink: "Adressen",
      datevKeine: "Für diese Gesellschaft ist noch keine DATEV-Adresse hinterlegt.",
      gesamt_one: "{{count}} Beleg",
      gesamt_other: "{{count}} Belege",
      fremdeObjekte_one:
        "{{count}} Beleg verweist auf ein Objekt einer anderen Gesellschaft ({{summe}}). Bitte die Zuordnung prüfen.",
      fremdeObjekte_other:
        "{{count}} Belege verweisen auf Objekte anderer Gesellschaften ({{summe}}). Bitte die Zuordnung prüfen.",
      fremdesObjektHinweis:
        "Objekt {{objekt}} ist {{gesellschaften}} zugeordnet, nicht dieser Gesellschaft.",
      col: {
        beleg: "Beleg",
        objekt: "Objekt",
        datum: "Datum",
        betrag: "Betrag",
        status: "Status",
      },
      ohneNr: "ohne Nr.",
      belegeEmpty: "Noch keine Belege.",
      belegeEmptyZeitraum: "Im gewählten Zeitraum wurde nichts verbucht.",
      action: {
        archivieren: "Archivieren",
        wiederherstellen: "Wiederherstellen",
        bearbeiten: "Bearbeiten",
        abbrechen: "Abbrechen",
        speichern: "Speichern",
        speichere: "Speichere …",
        mehr: "Weitere Aktionen",
        datev: "DATEV-Adressen",
        objekte: "Objekte verwalten",
      },
      toast: {
        archiviert: "Gesellschaft archiviert.",
        wiederhergestellt: "Gesellschaft wiederhergestellt.",
        archivierenFehlgeschlagen: "Fehlgeschlagen: {{error}}",
        pflicht: "Code und Name dürfen nicht leer sein.",
        keineAenderungen: "Keine Änderungen.",
        gespeichert: "Gespeichert.",
        speichernFehlgeschlagen: "Speichern fehlgeschlagen: {{error}}",
      },
    },
  },

  sources: {
    pageTitle: "Belegquellen & Ablage",
    pageSubtitle:
      "Wählen Sie, woher Belege eingesammelt werden und was nach der Verarbeitung mit ihnen passiert.",
    filingActive: "Verarbeitung ist aktiv",
    filingActiveDetail: "Belege werden aus den verbundenen Quellen eingesammelt.",
    filingInactive: "Verarbeitung ist pausiert",
    filingInactiveDetail: "Aktuell werden keine Belege eingesammelt.",
    lastRun: "Letzter Lauf",
    nextRun: "Nächster Lauf",
    viewLogs: "Protokoll ansehen",
    sourcesTitle: "Belegquellen",
    noSources: "Für dieses Projekt sind keine Quellen eingerichtet.",
    statusConnected: "Verbunden",
    statusNotConnected: "Nicht verbunden",
    statusNotConfigured: "Nicht eingerichtet",
    edit: "Bearbeiten",
    open: "Öffnen",
    connect: "Verbinden",
    setUp: "Einrichten",
    runNow: "Jetzt ausführen",
    runNowAsked: "Angefragt",
    runNowRunning: "Läuft …",
    runNowFoundOne: "1 neuer Beleg",
    runNowFound: "{{count}} neue Belege",
    runNowFailed: "Konnte nicht ausgeführt werden",
    runNowDialogTitle: "{{source}} jetzt ausführen",
    runNowDialogDescription:
      "Neue Belege jetzt lesen, statt auf den nächsten geplanten Lauf zu warten.",
    runNowDefault: "Die üblichen Ordner",
    runNowDefaultHint: "Genau das, was der geplante Lauf liest.",
    runNowChosen: "Bestimmte Ordner",
    runNowChosenHint:
      "Nach Belegen suchen, die nie importiert wurden, zum Beispiel in einem Archiv.",
    runNowLimits:
      "Bereits importierte Belege werden übersprungen. Startdatum und Laufgrenze des Mandanten gelten für diesen Lauf insgesamt.",
    runNowCancel: "Abbrechen",
    runNowStart: "Jetzt ausführen",
    runNowStarting: "Wird angefragt …",
    footerTitle: "Die Einstellungen werden vom Verarbeitungsdienst genutzt",
    footerDetail: "Änderungen gelten ab dem nächsten Verarbeitungslauf.",
    inactive: "Inaktiv",
    selectedLabel: "Liest aus:",
    mail: {
      name: "E-Mail",
      active_one: "Liest {{count}} Ordner",
      active_other: "Liest {{count}} Ordner",
    },
    filing: {
      name: "Dropbox",
      detail: "Ordner der Beleg-Ablage",
      active_one: "{{count}} Ordner ausgewählt",
      active_other: "{{count}} Ordner ausgewählt",
    },
    upload: {
      name: "Upload",
      detail: "Belege manuell hochladen",
      status: "Direkt im Hub verfügbar",
    },
    fields: {
      aktiv: "Aktiv",
      mailAdresse: "Belege aus diesem Postfach lesen",
      quelle: "Belege aus diesen Ordnern lesen",
      mailQuelleHint:
        "Leer lassen, um das gesamte Postfach zu prüfen. Mehrere Ordner werden nacheinander geprüft.",
      ziel: "Verarbeitete Belege hierhin verschieben",
      mailZielHint:
        "Nach der Verarbeitung landet die E-Mail hier, damit im Eingang nur Offenes bleibt. Leer lassen, um nichts zu verschieben.",
      rueckgabe: "Nicht relevante Belege hierhin verschieben",
      mailRueckgabeHint:
        "Ist eine E-Mail kein Beleg, landet sie hier. Leer lassen, um sie liegen zu lassen.",
      driveQuelleHint:
        "Manche Belege liegen hier statt im Postfach. Jeder Ordner wird nacheinander geprüft.",
      driveZielHint:
        "Nach der Verarbeitung landet die Datei hier. Leer lassen, um nichts zu verschieben.",
      driveRueckgabeHint:
        "Ist eine Datei kein Beleg, landet sie hier. Leer lassen, um sie liegen zu lassen.",
    },
    runs: {
      title: "Letzte Läufe",
      running: "läuft …",
      processed_one: "{{count}} Beleg verarbeitet",
      processed_other: "{{count}} Belege verarbeitet",
      errors_one: "{{count}} Fehler",
      errors_other: "{{count}} Fehler",
    },
    sheet: {
      close: "Schließen",
      refreshOptions: "Aktualisieren",
      optionsLoading: "Lädt…",
      optionsFailed: "Die Liste konnte nicht geladen werden. Gespeicherte Werte bleiben erhalten.",
      unknownValuePrefix: "Unbekannter Eintrag",
      selectedCount_one: "{{count}} ausgewählt",
      selectedCount_other: "{{count}} ausgewählt",
      searchPlaceholder: "Suchen …",
      noMatch: "Kein Treffer gefunden.",
      lastChangedByPrefix: "Zuletzt geändert von",
      adminOnly: "Nur Administratoren können diese Einstellungen ändern.",
      testConnection: "Verbindung testen",
      testRunning: "Teste…",
      advanced: "Erweiterte Einstellungen",
      none: "(keine Auswahl)",
      cancel: "Abbrechen",
      save: "Änderungen speichern",
      saving: "Speichert…",
      saveFailed: "Speichern fehlgeschlagen. Bitte erneut versuchen.",
      saved: "Gespeichert.",
    },
  },
  postfach: {
    title: "Postfach & Ablage",
    subtitle:
      "Woher Belege gelesen werden und wohin eine E-Mail nach der Verarbeitung wandert. Damit funktioniert auch die Rückgabe eines nicht relevanten Belegs ins Postfach.",
    pipelineHinweis:
      "Diese Einstellungen werden hier nur gespeichert. Gelesen und ausgeführt werden sie von der Ingest-Pipeline, einem eigenen Python-Prozess, der separat vom Server läuft. Eine Änderung wirkt also erst, wenn die Pipeline sie das nächste Mal liest.",
    folder: {
      waehlen: "Ordner wählen …",
      keineAuswahl: "Keine Auswahl",
      laedt: "Wird geladen …",
      aktualisieren: "Aktualisieren",
      // One notice for a whole card. Deliberately names no provider: this screen reads a
      // Microsoft mailbox and a Dropbox folder, not one service.
      ladenFehlgeschlagenBereich:
        "Ordner für {{bereich}} konnten nicht geladen werden. Falls diese Meldung bleibt, ist meist der Zugang zum Dienst noch nicht eingerichtet.",
      ordnerAusklappen: "Ordner ausklappen",
      ordnerEinklappen: "Ordner einklappen",
      ordnerFehlt_one:
        "{{count}} ausgewählter Ordner wird aktuell nicht angezeigt (evtl. gelöscht) und bleibt trotzdem gespeichert.",
      ordnerFehlt_other:
        "{{count}} ausgewählte Ordner werden aktuell nicht angezeigt (evtl. gelöscht) und bleiben trotzdem gespeichert.",
    },
    mailbox: {
      title: "Mailbox (Microsoft)",
      aktiv: "Dieses Postfach wird gelesen",
      aktivHint: "Aus bedeutet: Die Pipeline liest dieses Konto nicht.",
      adresse: "Postfach-Adresse",
      quelle: "Gelesene Ordner",
      quelleHint:
        "Leer bedeutet: das gesamte Postfach. Wichtig: Wenn im Postfach eigene Regeln Mails am Eingang vorbeisortieren, kommen sie hier nie an.",
      ziel: "Zielordner für verarbeitete E-Mails",
      zielHint:
        "Verarbeitete E-Mails werden hierhin verschoben. Ohne Zielordner bleiben sie im Eingang liegen und werden beim nächsten Lauf erneut geprüft.",
      rueckgabe: "Ordner für nicht relevante E-Mails",
      rueckgabeHint:
        "Dorthin kommt eine als nicht relevant markierte E-Mail zurück. Leer bedeutet: Sie bleibt liegen, wo sie ist.",
    },
    filing: {
      title: "Ablage (Dropbox)",
      aktiv: "Dieser Ordner wird gelesen",
      aktivHint: "Aus bedeutet: Die Pipeline liest diesen Ordner nicht.",
      quelle: "Quellordner",
      quelleHint:
        "Manche Belege liegen dort statt im Postfach. Mehrere Ordner werden nacheinander durchsucht.",
      ziel: "Zielordner für verarbeitete Dateien",
      zielHint:
        "Verarbeitete Dateien werden hierhin verschoben. Ohne Zielordner bleiben sie am Ursprungsort und werden beim nächsten Lauf erneut eingelesen.",
      rueckgabe: "Ordner für nicht relevante Dateien",
      rueckgabeHint:
        "Dorthin kommt eine als nicht relevant markierte Datei zurück. Leer bedeutet: Sie bleibt liegen, wo sie ist.",
    },
    // User first, technical detail last. This used to read "Bitte Migration 0091 anwenden",
    // which tells the person in front of it nothing except that something is broken.
    zeileFehlt:
      "Für {{provider}} sind noch keine Einstellungen angelegt, deshalb lässt sich hier gerade nichts speichern. Bitte den technischen Support informieren (die Einstellungszeile fehlt in der Datenbank, Migration 0091).",
    speichern: "Speichern",
    nurAdmin: "Nur Administratoren können diese Einstellungen ändern.",
    speichere: "Speichere …",
    gespeichert: "Einstellungen gespeichert.",
    fehlgeschlagen: "Speichern fehlgeschlagen: {{error}}",
    zuletzt: "Zuletzt geändert von {{by}}",
  },
  zuordnungsregeln: {
    list: {
      title: "Zuordnungsregeln",
      subtitle: "Regeln ordnen Belegen ihre Kostenkategorie automatisch zu.",
      hinweis:
        "Eine Regel kann Lieferant, Objekt und Gesellschaft in beliebiger Kombination festlegen. Je mehr Angaben eine Regel macht, desto spezifischer ist sie, und die spezifischste Regel gewinnt. Ein von Hand gesetzter Wert wird von keiner Regel überschrieben.",
      empty: "Noch keine Regeln angelegt.",
      emptyHint:
        "Die schnellste Startvariante: einen Beleg öffnen, Kategorie korrigieren und dort auf „Als Regel speichern“ klicken.",
      suche: "Regel suchen …",
      keineTreffer: "Keine Regel passt zur Suche.",
      keineTrefferHint: "Die Suche prüft Kategorie, Lieferant, Objekt und Gesellschaft.",
    },
    tab: {
      regeln: "Regeln",
      kategorien: "Kategorien",
      kontenrahmen: "Kontenrahmen",
      vorschlaege: "Vorschläge",
      spielplatz: "Testen",
    },
    // Browser tab titles, one per tab. Longer than the tab labels on purpose: „Regeln" alone is
    // ambiguous in a tab bar that may also hold Freigabe-Regeln, Ausschlussregeln and USt-Regeln.
    doktitel: {
      kategorien: "Kategorien",
      regeln: "Zuordnungsregeln",
      kontenrahmen: "Kontenrahmen",
      vorschlaege: "Vorschläge",
      spielplatz: "Testen",
    },
    target: {
      cost_category: "Kostenkategorie",
      vat_rate: "Umsatzsteuersatz",
    },
    targetHint: {
      cost_category:
        "Beispiel: alles von Ikea ist normalerweise Büromaterial. Ein Lieferant darf mehrere Kategorien haben, dann grenzt die Regel zusätzlich über Objekt oder Verwendungszweck ein.",
      vat_rate:
        "Die Umsatzsteuer hängt am USt-Status des Objekts: dasselbe Objekt kann steuerpflichtig oder steuerfrei sein, je nach Eintrag in den Objekt-Stammdaten.",
    },
    col: {
      wert: "Wert",
      geltungsbereich: "Geltungsbereich",
      wirkung: "Wirkung",
      wirkungHint:
        "Erste Zahl: wie viele bestehende Belege diese Regel jetzt noch ändern würde. Zweite Zahl: wie viele Belege insgesamt in ihren Geltungsbereich fallen. Die Differenz sind Belege, die schon richtig stehen oder von Hand entschieden wurden: Null als erste Zahl ist der gesunde Normalzustand.",
      aktiv: "Aktiv",
      aktionen: "Aktionen",
      abzugsfaehigkeit: "{{prozent}} % abzugsfähig",
    },
    wirkung: "{{change}} von {{total}}",
    scope: {
      lieferant: "Lieferant",
      objekt: "Objekt",
      gesellschaft: "Gesellschaft",
      verwendungszweck: "Verwendungszweck enthält",
    },
    vatTreatment: {
      steuerpflichtig: "steuerpflichtig",
      steuerfrei: "steuerfrei",
      reverse_charge: "Reverse-Charge",
      kleinunternehmer: "Kleinunternehmer",
    },
    vatSonderfall: {
      hospitality: "Bewirtung",
      partial: "Teilweise abzugsfähig",
      down_payment: "Anzahlung",
    },
    neu: {
      // Per-target labels: cost-category rules come from the Regeln tab, VAT rules only from the
      // USt-Regeln tab (a VAT rule is created from exactly one place, so the dialog's own wording
      // says which kind it is rather than the generic "Regel").
      button: {
        cost_category: "Neue Kategorie-Regel",
        vat_rate: "Neue USt-Regel",
      },
      title: {
        cost_category: "Kategorie-Regel anlegen",
        vat_rate: "USt-Regel anlegen",
      },
      desc: {
        cost_category:
          "Lege fest, welche Kategorie gesetzt wird und für welche Belege die Regel gilt.",
        vat_rate:
          "Lege Satz, steuerliche Behandlung und Abzugsfähigkeit fest, und für welche Belege die Regel gilt.",
      },
      feld: "Welches Feld setzt die Regel?",
      kategorie: "Kostenkategorie",
      kategoriePlaceholder: "z. B. Büromaterial",
      ustSatz: "Umsatzsteuersatz in Prozent",
      ustUngueltig: "Bitte eine Zahl eingeben, z. B. 19 oder 7.",
      // A VAT rate is a percentage. 199 is not a typo the app should accept and then let someone
      // bulk-apply across every matching invoice.
      ustAusserhalb: "Bitte einen Satz zwischen 0 und 100 eingeben.",
      // Not an error: 5,5 % or 16 % were real German rates and other EU rates exist. Worth a
      // second look, not a block.
      ustUnueblich: "Ungewöhnlicher Satz. In Deutschland gelten 0 %, 7 % oder 19 %.",
      geltungsbereich: "Geltungsbereich",
      geltungsbereichHint:
        "Mindestens eine Angabe ist nötig. Alles, was auf „beliebig“ steht, schränkt nicht ein.",
      beliebig: "beliebig",
      musterPlaceholder: "z. B. Werkstatt",
      musterHint:
        "Trifft zu, wenn der Verwendungszweck diesen Text enthält. Groß- und Kleinschreibung spielt keine Rolle.",
      steuerbehandlung: "Steuerliche Behandlung (optional)",
      steuerbehandlungOhne: "keine besondere Behandlung",
      steuerbehandlungHint:
        "Für Fälle, die ein Prozentsatz allein nicht ausdrückt, z. B. Reverse-Charge oder Kleinunternehmer.",
      abzugsfaehigkeit: "Abzugsfähigkeit in Prozent (optional)",
      abzugsfaehigkeitHint:
        "100 = voll abzugsfähig (Kosten netto), 0 = nicht abzugsfähig (Kosten brutto). Leer lassen, um vom USt-Status des Objekts auszugehen.",
      abzugsfaehigkeitUngueltig: "Bitte eine Zahl zwischen 0 und 100 eingeben.",
      sonderfall: "Steuerlicher Sonderfall (optional)",
      sonderfallOhne: "kein Sonderfall",
      sonderfallBewirtungHinweis:
        "Schlägt 70 % vor. Das betrifft nach deutschem Steuerrecht eigentlich die einkommensteuerliche Abzugsfähigkeit von Bewirtungskosten, nicht zwingend die Vorsteuer selbst. Bitte mit dem Steuerberater abstimmen.",
      notiz: "Notiz (optional)",
      vorschau: "Wirkung auf bestehende Belege",
      vorschauLaedt: "Wird berechnet …",
      vorschauFehler: "Die Vorschau konnte nicht berechnet werden.",
      vorschauText: "Diese Regel würde {{change}} von {{total}} passenden Belegen ändern.",
      vorschauHint:
        "Die Differenz sind Belege, die schon richtig stehen oder von Hand entschieden wurden. Die tastet die Regel nicht an.",
      scopeFehlt: "Bitte mindestens eine Angabe im Geltungsbereich machen.",
      wertFehlt: "Bitte den Wert setzen, den die Regel vergeben soll.",
      schonVorhanden:
        "Für genau diesen Geltungsbereich gibt es bereits eine Regel für dieses Feld. Bitte die bestehende Regel anpassen.",
      speichern: {
        cost_category: "Kategorie-Regel anlegen",
        vat_rate: "USt-Regel anlegen",
      },
    },
    action: {
      abbrechen: "Abbrechen",
      bearbeiten: "Regel bearbeiten",
      loeschen: "Löschen",
      loeschenTitle: "Regel löschen?",
      loeschenDesc:
        'Die Regel „{{wert}}" greift danach nicht mehr. Sie bleibt revisionssicher gespeichert, weil sie bestehende Zuordnungen geprägt hat. Bereits gesetzte Werte auf Belegen bleiben unverändert.',
      loeschenConfirm: "Regel löschen",
      grundPlaceholder: "Grund (optional)",
      anwenden: "Jetzt anwenden",
      anwendenTitle: "Regel auf bestehende Belege anwenden?",
      anwendenDesc:
        "Diese Regel würde {{change}} von {{total}} passenden Belegen ändern. Von Hand gesetzte Werte werden dabei nie überschrieben. Jede Änderung wird protokolliert.",
      anwendenKeine: "Diese Regel würde derzeit keinen Beleg ändern.",
      anwendenConfirm: "{{count}} Belege anwenden",
    },
    toast: {
      angelegt: "Regel angelegt.",
      gespeichert: "Regel gespeichert.",
      aktiviert: "Regel aktiviert.",
      deaktiviert: "Regel deaktiviert.",
      geloescht: "Regel gelöscht.",
      fehlgeschlagen: "Fehlgeschlagen: {{error}}",
      angewendet: "{{changed}} von {{matches}} Belegen aktualisiert.",
      angewendetUebersprungen:
        "{{changed}} von {{matches}} Belegen aktualisiert, {{skipped}} von Hand gesetzt und übersprungen.",
      angewendetKeine: "Kein Beleg musste geändert werden.",
    },
    test: {
      title: "Szenario testen",
      hint: "Einen Beleg beschreiben und prüfen lassen, welche Regel die Kategorie setzen würde.",
      verwendungszweck: "Verwendungszweck",
      verwendungszweckPlaceholder: "Optionaler Text zum Abgleich",
      pruefen: "Prüfen",
      zuruecksetzen: "Zurücksetzen",
      leer: "Noch nichts geprüft",
      leerHinweis:
        "So viel vom Beleg eintragen wie bekannt ist und auf Prüfen klicken. Alles, was auf beliebig steht, gilt als nicht eingeschränkt, genau so, wie eine Regel ein Merkmal behandelt, das sie nicht festlegt.",
      trifftZu: "Diese Regel greift",
      verdraengtTitel: "Passen ebenfalls, werden aber verdrängt",
      weitere_one: "{{count}} weitere Regel passt ebenfalls, wird aber verdrängt.",
      weitere_other: "{{count}} weitere Regeln passen ebenfalls, werden aber verdrängt.",
      einzige: "Keine andere Regel passt.",
      keine: "Keine Regel trifft zu.",
      keineHinweis: "Der Beleg behält die Kategorie, die er bereits hat.",
    },
  },
  ustRegeln: {
    list: {
      title: "USt-Regeln",
      subtitle:
        "Regeln, die Satz, steuerliche Behandlung und Abzugsfähigkeit der Umsatzsteuer setzen.",
    },
    gesellschaft: "Gesellschaft",
    alleGesellschaften: "Alle Gesellschaften",
    tabs: {
      regeln: "USt-Regeln",
      ruecklage: "Steuerrücklage",
    },
    hinweis:
      "USt-Regeln setzen Satz, steuerliche Behandlung und Abzugsfähigkeit gemeinsam. Dieselbe Regel wie bei den Zuordnungsregeln, hier auf eine Gesellschaft gefiltert. Eine Regel schlägt die KI, ein von Hand gesetzter Wert schlägt beides.",
    empty: "Für diese Auswahl gibt es noch keine USt-Regeln.",
    // Names the button that is actually on this screen. It used to say „Neue Regel", which is not
    // a label anything here carries.
    emptyHint:
      "Über „Neue USt-Regel“ eine USt-Regel für Lieferant, Objekt oder Gesellschaft anlegen.",
    ruecklage: {
      kpiErstattung: "Erstattung erwartet",
      kpiFaellig: "Gesellschaften mit fälliger Rücklage",
      kpiUngeklaert: "Ungeklärte Belege",
      titel: "Steuerrücklage",
      hinweis:
        "Nur eine Empfehlung, keine Buchung. Rücklage = Umsatzsteuer aus Ausgangsrechnungen minus abzugsfähige Vorsteuer.",
      gesamt: "Vorsteuer gesamt",
      abzugsfaehig: "davon abzugsfähig",
      nichtAbzugsfaehig: "davon nicht abzugsfähig",
      umsatzsteuer: "Umsatzsteuer (Ausgang)",
      ruecklage: "Empfohlene Rücklage",
      unresolved:
        "{{count}} Beleg(e) mit {{betrag}} Vorsteuer noch ohne bestimmte Abzugsfähigkeit, nicht in der Rücklage berücksichtigt.",
      // Same fact as `unresolved`, short enough to sit visibly in a table row instead of inside a
      // hover tooltip no touchscreen can open.
      unresolvedKurz: "{{count}} Beleg(e) · {{betrag}} noch ohne Abzugsfähigkeit",
      // A negative reserve is the OPPOSITE of every other figure here. Everything else is money
      // the company owes; this is money it is owed.
      erstattung: "Vorsteuerüberhang, Erstattung zu erwarten",
      leer: "Noch keine Gesellschaften vorhanden.",
    },
    anzahl: {
      lieferant: "{{count}} nach Lieferant",
      objekt: "{{count}} nach Objekt",
      gesellschaft: "{{count}} nach Gesellschaft",
      global: "{{count}} für alle Gesellschaften",
    },
  },
  kategorien: {
    list: {
      title: "Kategorien",
      subtitle: "Kosten und Erlöse in Kategorien bündeln, auf die Zuordnungsregeln verweisen.",
    },
    suche: "Kategorie suchen …",
    keineTreffer: "Keine Kategorie passt zur Suche.",
    keineTrefferHint: "Suchbegriff kürzen oder leeren, um wieder alle Gruppen zu sehen.",
    leer: "Noch keine Kategorien angelegt.",
    hinweis:
      "Jede Kategorie kann Unterkategorien haben. Wenn Sie eine löschen, verschwindet sie aus den Listen. Belege, die sie schon nutzen, behalten den Namen.",
    col: {
      name: "Name",
      hinweis: "Notiz",
      aktionen: "Aktionen",
    },
    action: {
      bearbeiten: "Bearbeiten",
    },
    edit: {
      title: "Kategorie bearbeiten",
      speichern: "Speichern",
    },
    feld: {
      unterVon: "Wird unter „{{name}}“ angelegt.",
      art: "Art",
      name: "Name",
      notiz: "Notiz (optional)",
      parent: "Übergeordnete Kostengruppe",
      parentKeiner: "Keine (neue Kostengruppe)",
      code: "Code (eindeutig, z. B. OCC_SOLAR)",
      block: "BWA-Block",
      line: "BWA-Zeile (technischer Schlüssel)",
      blockGeerbt: "Übernimmt BWA-Block und -Zeile von „{{name}}“.",
    },
    block: {
      einnahmen: "Einnahmen",
      wareneinsatz: "Wareneinsatz",
      kosten: "Kosten",
      neutral: "Neutraler Bereich",
      steuern: "Steuern",
      sonderfall: "Sonderfall",
    },
    neu: {
      unterkategorie: "Unterkategorie anlegen",
      button: "Neue Kategorie",
      title: "Kategorie anlegen",
      desc: "Als Kind einer bestehenden Kostengruppe oder als neue, eigenständige Kostengruppe.",
      wertFehlt: "Bitte Code, deutschen Namen und BWA-Zeile ausfüllen.",
      codeSchonVorhanden: "Dieser Code ist bereits vergeben. Bitte einen anderen wählen.",
      speichern: "Kategorie anlegen",
    },
    loeschen: {
      title: "Kategorie löschen?",
      desc: "„{{name}}“ verschwindet danach aus der Auswahl für neue Zuordnungen. Belege und Regeln, die sie bereits verwenden, zeigen ihren Namen weiterhin an.",
    },
    toast: {
      sortiert: "Reihenfolge gespeichert.",
      angelegt: "Kategorie angelegt.",
      gespeichert: "Kategorie gespeichert.",
      geloescht: "Kategorie gelöscht.",
    },
  },
  kontenrahmen: {
    gesellschaft: "Gesellschaft",
    suche: "Suche",
    suchePlaceholder: "Konto, Kategorie oder Notiz …",
    keineTreffer: "Kein Konto passt zur Suche.",
    keineTrefferHint: "Die Suche prüft Kontonummer, zugeordnete Kategorie und Notiz.",
    jahr: "Wirtschaftsjahr",
    hinweis:
      "Die Zuordnung Kategorie → DATEV-Konto gilt für genau ein Wirtschaftsjahr und genau eine Gesellschaft, weil DATEV den Kontenrahmen jedes Jahr neu aufbaut und zwei Gesellschaften dieselbe Kontonummer für unterschiedliche Zwecke verwenden können. Noch keine echten Kontonummern hinterlegt? Über „Mit KI importieren“ die vom Steuerberater gelieferte Liste einspielen.",
    empty: "Für dieses Jahr ist noch kein Kontenrahmen hinterlegt.",
    emptyHint: "Über „Mit KI importieren“ die Liste vom Steuerberater einspielen.",
    col: {
      konto: "Konto",
      kategorie: "Kategorie",
      notiz: "Notiz",
    },
    kiImport: {
      button: "Mit KI importieren",
      title: "Kontenrahmen mit KI importieren",
      jahre: "Wirtschaftsjahre",
      desc: "Gesellschaft und Wirtschaftsjahr(e) wählen, dann die Datei vom Steuerberater hochladen (CSV, Excel, PDF oder Bild). Die KI erkennt Kontonummer, Bezeichnung und schlägt pro Konto eine Kategorie vor, vor dem Import bleibt jede Zeile änderbar. Bei mehreren Jahren wird derselbe Kontenrahmen in jedes gewählte Jahr importiert.",
      auswahlFehlt: "Bitte zuerst Gesellschaft und mindestens ein Wirtschaftsjahr wählen.",
      dropHint: "Datei hierher ziehen oder auswählen",
      dropRelease: "Datei loslassen",
      fileTypes: "CSV, Excel, PDF oder Bild, max. 15 MB",
      chooseFile: "Datei auswählen",
      analysiere: "Die KI analysiert die Datei …",
      vorschau: "{{recognized}} von {{total}} Konten einer Kategorie zugeordnet.",
      keineKategorie: "Kategorie wählen …",
      abbrechen: "Abbrechen",
      speichere: "Speichert …",
      speichernConfirm: "{{count}} Konten importieren ({{jahre}} Jahr(e))",
      fehler: {
        title: "Datei konnte nicht ausgewertet werden.",
        andereDatei: "Andere Datei wählen",
      },
      toast: {
        zuGrossFuerAnalyse:
          "Die Datei ist zu groß für die automatische Erkennung. Bitte die Felder selbst ausfüllen.",
        zuGross: "Datei ist zu groß (max. 15 MB).",
        typUngueltig: "Dateityp wird nicht unterstützt.",
        keineKonten: "In dieser Datei konnten keine Konten erkannt werden.",
        analyseFehlgeschlagen: "Analyse fehlgeschlagen: {{error}}",
        importiert: "{{count}} Konten importiert (Jahre: {{jahre}}).",
        jahrFehlgeschlagen:
          "Import für {{jahr}} fehlgeschlagen: {{error}}. Bereits importierte Jahre bleiben gespeichert.",
      },
    },
  },
  vorschlaege: {
    suche: "Lieferant oder Kategorie suchen …",
    keineTreffer: "Kein Vorschlag passt zur Suche.",
    keineTrefferHint: "Die Suche prüft Lieferantenname und vorgeschlagene Kategorie.",
    hinweis:
      "Nur zur Ansicht: Lieferanten ohne aktive Regel, mit der Kategorie, die ihre bisherigen Belege nahelegen. Hier wird nichts gespeichert. „Regel anlegen“ übergibt Lieferant und Kategorie an den Regel-Dialog im Reiter Regeln, der vor dem Speichern zeigt, wie viele vorhandene Belege sich dadurch ändern.",
    empty: "Aktuell keine Vorschläge.",
    emptyHint:
      "Ein Vorschlag erscheint nur, wenn die bisherigen Belege eines Lieferanten auf eine echte Kategorie zeigen. „Nicht zugeordnet“ zählt nicht dazu.",
    belegeCount: "{{n}} von {{total}} Belegen",
    col: {
      lieferant: "Lieferant",
      belege: "Belege",
      kategorie: "Vorgeschlagene Kategorie",
      aktion: "Aktion",
    },
    action: {
      regelAnlegen: "Regel anlegen →",
    },
  },
  ausschlussregeln: {
    list: {
      title: "Ausschlussregeln",
      subtitle:
        "Regeln, die Mails/Belege beim Import ausschließen. Passt ein Begriff im gewählten Bereich, wird der Beleg übersprungen (nicht importiert).",
      col: { scope: "Bereich", term: "Begriff", note: "Notiz", active: "Aktiv" },
      empty: "Keine Ausschlussregeln.",
      search: "Suche (Begriff, Notiz) …",
      count_one: "{{count}} Regel",
      count_other: "{{count}} Regeln",
      keineTreffer: "Keine Regel passt zu den Filtern.",
      filterZuruecksetzen: "Filter zurücksetzen",
      filter: {
        button: "Filter",
        title: "Filter",
        zuruecksetzen: "Filter zurücksetzen",
        alleBereiche: "Alle Bereiche",
        status: "Status",
        alle: "Alle",
        aktiv: "Aktiv",
        inaktiv: "Inaktiv",
      },
      neu: { button: "Neue Regel" },
      action: { loeschen: "Löschen" },
    },
    scope: {
      sender: "Absender (E-Mail)",
      subject: "Betreff",
      filename: "Dateiname",
      envelope: "Absender/Betreff/Datei",
      party: "Partei (Absender/Empfänger)",
      supplier: "Lieferant",
      body: "E-Mail-Text / Volltext",
      company: "Gesellschaft",
      property: "Objekt",
      groupPre: "Vor der KI-Auslesung (E-Mail/Datei)",
      groupPost: "Nach der Auslesung (erkannte Felder)",
    },
    vorschau: {
      laeuft: "Prüfe, was diese Regel treffen würde …",
      fehler:
        "Die Vorschau konnte nicht ermittelt werden. Die Regel kann trotzdem angelegt werden, ihre Reichweite ist dann aber ungeprüft.",
      nichtVerfuegbar:
        "Für diesen Bereich gibt es keine Vorschau: es existiert im Hub keine Spalte, die dasselbe bedeutet.",
      keine: "Kein Treffer unter {{gesamt}} bisher verarbeiteten Einträgen.",
      treffer:
        "Würde {{anzahl}} von {{gesamt}} bisher verarbeiteten Einträgen betreffen ({{prozent}} %). Betroffene Belege entstehen gar nicht erst.",
    },
    dialog: {
      neu: { title: "Neue Ausschlussregel", desc: "Bereich, Suchbegriff und optional eine Notiz." },
      field: { scope: "Bereich", term: "Begriff", note: "Notiz (optional)" },
      termPlaceholder: "z. B. Newsletter, ACME, PROP12 …",
      notePlaceholder: "Warum diese Regel?",
      cancel: "Abbrechen",
      save: "Anlegen",
      saving: "Speichere …",
      toast: {
        termPflicht: "Begriff ist erforderlich.",
        scopePflicht: "Bereich ist erforderlich.",
        angelegt: "Regel angelegt.",
        anlegenFehlgeschlagen: "Anlegen fehlgeschlagen: {{error}}",
      },
    },
    toggle: {
      aktiviert: "Regel aktiviert.",
      deaktiviert: "Regel deaktiviert.",
      fehlgeschlagen: "Aktualisieren fehlgeschlagen: {{error}}",
    },
    delete: {
      title: "Regel löschen?",
      desc: '„{{term}}" ({{scope}}) wird deaktiviert und aus der Liste entfernt.',
      cancel: "Abbrechen",
      confirm: "Löschen",
      toast: {
        geloescht: "Regel gelöscht.",
        fehlgeschlagen: "Löschen fehlgeschlagen: {{error}}",
      },
    },
  },

  // Admin-configurable uniform filename pattern (migration 20260804090000_filename_settings). "YYYYMMDD COM[_VAT] Issuer
  // Description [Amount] [Property]" — the receipt type is deliberately not part of the name.
  profil: {
    title: "Mein Profil",
    subtitle: "Ihr Name, Ihre Anmeldedaten und was Ihr Konto darf.",
    bild: {
      title: "Profilbild",
      desc: "Wird überall neben Ihrem Namen angezeigt.",
      waehlen: "Bild hochladen",
      ersetzen: "Bild ersetzen",
      entfernen: "Entfernen",
      laedt: "Wird hochgeladen …",
      hinweis: "Ein quadratisches Bild passt am besten. Höchstens {{groesse}}.",
      falscherTyp: "Diese Datei ist kein Bild, das wir verwenden können.",
      zuGross: "Dieses Bild ist größer als {{groesse}}.",
      gespeichert: "Profilbild aktualisiert.",
      entfernt: "Profilbild entfernt.",
      fehler: "Das Bild konnte nicht gespeichert werden: {{fehler}}",
      entfernenTitel: "Profilbild entfernen?",
      entfernenText:
        "Stattdessen werden Ihre Initialen angezeigt. Sie können jederzeit ein neues Bild hochladen.",
      entfernenBestaetigen: "Entfernen",
      abbrechen: "Abbrechen",
    },
    daten: {
      title: "Name und E-Mail",
      desc: "Wie Sie für Ihre Kolleginnen und Kollegen erscheinen und womit Sie sich anmelden.",
      name: "Name",
      email: "E-Mail",
      emailHinweis: "Mit der E-Mail-Adresse ändert sich auch die Anmeldung.",
      emailGesperrt:
        "Ihre E-Mail-Adresse ändert eine Administratorin oder ein Administrator unter Verwaltung › Team.",
      nameErforderlich: "Bitte geben Sie einen Namen ein.",
      emailErforderlich: "Bitte geben Sie eine E-Mail-Adresse ein.",
      emailUngueltig: "Diese E-Mail-Adresse sieht nicht gültig aus.",
      speichern: "Speichern",
      speichert: "Wird gespeichert …",
      gespeichert: "Gespeichert.",
      fehler: "Speichern fehlgeschlagen: {{fehler}}",
    },
    passwort: {
      title: "Passwort",
      desc: "Wählen Sie ein Passwort, das Sie nirgendwo sonst verwenden.",
      aktuell: "Aktuelles Passwort",
      neu: "Neues Passwort",
      wiederholen: "Neues Passwort wiederholen",
      anzeigen: "Passwörter anzeigen",
      verbergen: "Passwörter verbergen",
      zuKurz: "Das neue Passwort braucht mindestens {{anzahl}} Zeichen.",
      stimmtNicht: "Die beiden neuen Passwörter sind nicht gleich.",
      wieBisher: "Das neue Passwort ist dasselbe wie das aktuelle.",
      aendern: "Passwort ändern",
      aendert: "Wird geändert …",
      geaendert: "Passwort geändert.",
      fehler: "Das Passwort konnte nicht geändert werden: {{fehler}}",
      gesperrt: "Ihr Passwort wird außerhalb dieser Anwendung verwaltet.",
    },
    zugriff: {
      title: "Rolle und Rechte",
      desc: "Was Ihr Konto darf.",
      rolle: "Rolle",
      rechte: "Rechte",
      nurLesen:
        "Diese Liste zeigt, was Sie haben. Für eine Änderung wenden Sie sich an eine Administratorin oder einen Administrator.",
      nurLesenEigentuemer: "Das Eigentümerkonto hält immer alle Rechte.",
      nurLesenAdmin: "Diese Liste zeigt, was Sie haben. Ändern können Sie das unter Team & Rollen.",
      leer: "Für Ihr Konto sind keine Rechte hinterlegt.",
    },
    fehler: {
      keinKonto: "Zu dieser Anmeldung wurde kein Konto gefunden.",
      passwortFalsch: "Das aktuelle Passwort stimmt nicht.",
      passwortAenderung: "Das Passwort konnte nicht geändert werden.",
    },
  },
  dateibenennung: {
    readOnlyHint:
      "Nur Administratoren können diese Einstellungen ändern. Wer das darf, steht unter Verwaltung › Team.",
    wirkungHinweis:
      "Gilt für alle Gesellschaften dieses Hubs und wirkt ab dem Speichern: bereits abgelegte Dateien behalten ihren bisherigen Namen.",
    zuletztGeaendert: "Zuletzt geändert von {{wer}} am {{wann}}.",
    unbekannt: "unbekannt",
    abweichung: "Diese Einstellungen weichen vom vorgegebenen Namensschema ab.",
    standardWiederherstellen: "Standard wiederherstellen",
    trennzeichenUngueltig:
      'Nicht erlaubt: \\ / : * ? " < > | und leer. Diese Zeichen werden aus dem Dateinamen entfernt, die Bestandteile würden zusammenkleben.',
    ustKennzeichenUngueltig: 'Nicht erlaubt: \\ / : * ? " < > | und leer.',
    ustKennzeichenHinweis:
      "Wird mit einem festen Unterstrich an die Gesellschaft gehängt (z. B. IMKO_UST), unabhängig vom Trennzeichen oben.",
    title: "Dateibenennung",
    subtitle:
      "Einheitliches Namensschema für Belege: Datum, Gesellschaft, Rechnungssteller, Beschreibung, Betrag und Objekt. Die Belegart ist bewusst nicht Teil des Namens, sie ergibt sich aus dem Ordner.",
    card: {
      structure: {
        title: "Struktur",
        desc: "Trennzeichen und optionale Bestandteile des Dateinamens.",
      },
      description: {
        title: "Beschreibung",
        desc: "Woher der Beschreibungstext im Dateinamen stammt.",
      },
    },
    field: {
      separator: "Trennzeichen",
      vatSuffix: "USt-Kennzeichen",
      includeVatSuffix: "USt-Kennzeichen anhängen (bei USt-relevanten Belegen)",
      includeAmount: "Betrag einfügen",
      includeProperty: "Objekt einfügen",
      transliterateUmlauts: "Umlaute transliterieren (ä → ae, ß → ss, …)",
      descriptionSource: "Beschreibung aus",
    },
    descriptionSource: {
      service_description: "Leistungsbeschreibung",
      cost_category: "Kostenkategorie",
      none: "Keine Beschreibung",
    },
    preview: {
      fall: {
        vollstaendig: "Vollständiger Beleg",
        ohneObjekt: "Ohne Objekt und Beschreibung",
        minimal: "Nur Datum und Gesellschaft",
      },
      title: "Vorschau",
      desc: "Beispiel anhand eines Musterbelegs.",
      empty: "Keine Vorschau möglich, es fehlen Daten.",
      typeHint: "Die Belegart ist nie Teil des Dateinamens.",
    },
    save: "Speichern",
    saving: "Speichere …",
    toast: {
      saved: "Einstellungen gespeichert.",
      failed: "Speichern fehlgeschlagen: {{error}}",
    },
  },

  // Properties (Objekte) — list + detail pages. ust_status enum values are DB-derived
  // and shown as-is (steuerpflichtig / steuerfrei / gemischt), not translated.
  objekte: {
    // Feldbezogene Prüfung für den Objekt-Dialog, gleiche Form wie gesellschaften.validierung.
    // Kein Format-Hinweis: Objektcodes enthalten hier Bindestriche und Umlaute.
    validierung: {
      code: "Bitte einen Code eingeben, z. B. MA-OMS.",
      codeLaenge: "Der Code darf höchstens 32 Zeichen lang sein.",
      codeVergeben: "Dieser Code ist bereits vergeben.",
    },
    zuordnung: {
      // Direct property↔company assignment (migration 0083) — a property may belong to more than
      // one company (Eigentümer vermietet, Mieter bucht Aufwand), but at least one is required.
      keineZuordnung: "Mindestens eine Gesellschaft ist erforderlich.",
      gesellschaft: "Gesellschaft(en)",
      gesellschaftWaehlen: "Gesellschaft(en) wählen",
    },
    ohne: "Ohne",
    // VAT-status enum labels — the value stored in ust_status stays the DB literal.
    ustStatus: {
      steuerpflichtig: "Steuerpflichtig",
      steuerfrei: "Steuerfrei",
      gemischt: "Gemischt",
    },
    // Eigenbestand vs. Fremdverwaltung. Stäys properties-Tabelle hat die Spalte nicht; die Labels
    // stehen hier, damit ein Umlegen des Capability-Flags keinen Übersetzungslauf nachzieht.
    eigentum: {
      own: "Eigenbestand",
      client: "Fremdverwaltung (Kunde)",
    },
    list: {
      // Das Filter-Popover der Objektliste.
      filter: {
        button: "Filter",
        title: "Objekte filtern",
        reset: "Filter zurücksetzen",
        status: "Status",
        statusAlle: "Alle",
        statusAktiv: "Aktiv",
        statusArchiviert: "Archiviert",
        gesellschaftAlle: "Alle Gesellschaften",
        eigentumAlle: "Alle Eigentumsarten",
        adresse: "Adresse",
        ohneAdresse_one: "{{count}} ohne Adresse",
        ohneAdresse_other: "{{count}} ohne Adresse",
        pruefung: "Prüfung",
      },
      title: "Objekte",
      subtitle: "Objektstamm: Immobilien/Projekte, denen Rechnungen zugeordnet werden.",
      search: "Objekt suchen …",
      col: {
        objekt: "Objekt (Code / Adresse)",
        gesellschaft: "Gesellschaft",
        verbucht: "Verbucht",
        createdAt: "Erstellt",
        updatedAt: "Aktualisiert",
      },
      belegeCount_one: "{{count}} Beleg",
      belegeCount_other: "{{count}} Belege",
      empty: "Keine Objekte im Stammdaten.",
      archiviert: "Archiviert",
      pruefenBadge: "Prüfen",
      pruefenTitle: "Stammdaten seit über 180 Tagen nicht bestätigt.",
      nurPruefen_one: "Nur zu prüfen ({{count}})",
      nurPruefen_other: "Nur zu prüfen ({{count}})",
      neu: {
        button: "Neu",
        title: "Neues Objekt",
        desc: "Objektstammdaten anlegen. Der Code muss eindeutig sein.",
        codeLabel: "Code",
        codePlaceholder: "z. B. WIBO7",
        nameLabel: "Name",
        namePlaceholder: "Bezeichnung",
        adresseLabel: "Adresse",
        adressePlaceholder: "Straße, Ort",
        gesellschaftLabel: "Gesellschaft",
        ustStatusLabel: "USt-Status",
        cancel: "Abbrechen",
        anlegen: "Anlegen",
        anlege: "Lege an …",
      },
      toast: {
        codePflicht: "Code ist erforderlich.",
        angelegt: "Objekt angelegt.",
        angelegtOhneGesellschaft:
          "Objekt {{code}} angelegt, aber die Gesellschaft(en) konnten nicht gespeichert werden: {{error}}. Bitte auf der Objektseite ergänzen.",
        anlegenFehlgeschlagen: "Anlegen fehlgeschlagen: {{error}}",
      },
    },
    detail: {
      back: "Objekte",
      editTitle: "Objekt bearbeiten",
      editDesc: "Objektstammdaten bearbeiten.",
      notInStammBefore: "Dieses Objekt (",
      notInStammAfter:
        ") ist nicht im Objektstamm hinterlegt, der Code stammt aus der KI-Extraktion. Lege es unter „Objekte“ an, um es Rechnungen fest zuordnen zu können.",
      section: {
        stammdaten: "Stammdaten",
        verbucht: "Auf dieses Objekt verbucht",
        gesellschaften: "Gesellschaften",
      },
      field: {
        code: "Code",
        name: "Name",
        adresse: "Adresse",
        gesellschaft: "Gesellschaft",
        ustStatus: "USt-Status",
        eigentum: "Eigentum",
        driveFolder: "Ordner-Link",
        erstellt: "Erstellt",
        aktualisiert: "Aktualisiert",
      },
      belegeCount_one: "{{count}} Beleg",
      belegeCount_other: "{{count}} Belege",
      noBelege: "Für dieses Objekt sind keine Belege verbucht.",
      // Dieselbe Liste, nur vom Zeitraum-Filter eingegrenzt: nichts hier heißt nicht nichts.
      noBelegeZeitraum: "In diesem Zeitraum sind keine Belege verbucht.",
      // Direkte Zuordnung Objekt -> Gesellschaft, auf dieser Seite bearbeitbar.
      gesellschaftenHint:
        "Ein Objekt kann zu mehreren Gesellschaften gehören, z. B. wenn Eigentümer und Mieter denselben Aufwand jeweils in ihrer eigenen Gesellschaft buchen.",
      gesellschaftenEmpty: "Noch keine Gesellschaft zugeordnet.",
      // Per assignment, because the same Objekt has a different number in each company.
      kostenstelle: "Kostenstelle {{nr}}",
      kostenstelleFehlt: "Kostenstelle fehlt",
      kostenstelleLabel: "Kostenstellen-Nummer",
      kostenstellePlatzhalter: "z. B. 6",
      kostenstelleHinweis:
        "Die Nummer, unter der der Steuerberater dieses Objekt in dieser Gesellschaft bucht. Leer lassen, wenn sie noch nicht bekannt ist.",
      kostenstelleNurAdmin: "Kostenstellen-Nummern können nur Administratoren eintragen.",
      kostenstelleUngueltig: "Bitte eine positive ganze Zahl eingeben.",
      zuordnungHinzufuegen: "Gesellschaft hinzufügen",
      zuordnungBearbeiten: "Zuordnung bearbeiten",
      zuordnungDialogNeu: "Gesellschaft hinzufügen",
      zuordnungDialogBearbeiten: "Zuordnung bearbeiten",
      zuordnungDialogBeschreibung:
        "Wähle die Gesellschaft und die Kostenstellen-Nummer, unter der dieses Objekt dort gebucht wird.",
      zuordnungFirmaFehlt: "Bitte eine Gesellschaft auswählen.",
      zuordnungObjektFehlt: "Bitte ein Objekt auswählen.",
      zuordnungObjekt: "Objekt",
      zuordnungObjektWaehlen: "Objekt auswählen",
      zuordnungDialogNeuObjekt: "Objekt hinzufügen",
      zuordnungDialogBeschreibungObjekt:
        "Wähle das Objekt und die Kostenstellen-Nummer, unter der es in dieser Gesellschaft gebucht wird.",
      zuordnungEntfernen: "Gesellschaft entfernen",
      zuordnungEntfernenTitel: "Gesellschaft vom Objekt entfernen?",
      zuordnungEntfernenBeschreibung:
        "Das Objekt gehört danach nicht mehr zu {{gesellschaft}}. Bereits gebuchte Belege bleiben unverändert.",
      zuordnungEntfernenBestaetigen: "Entfernen",
      zuordnungLetzte:
        "Ein Objekt braucht mindestens eine Gesellschaft. Füge zuerst eine andere hinzu.",
      // Für die Capabilities, die Stäy nicht einschaltet (Archiv, Prüfung, Ordner-Link).
      reviewBanner: "Zuletzt geprüft am {{datum}}: Sind diese Angaben noch korrekt?",
      archivedNotice: "Dieses Objekt ist archiviert ({{grund}}), nicht mehr im aktiven Bestand.",
      archivedNoticeOhneGrund: "kein Grund angegeben",
      archiveDialog: {
        title: "Objekt archivieren?",
        desc: "Das Objekt verschwindet nicht, es gilt nur nicht mehr als aktiv (z. B. nach einem Verkauf). Bestehende Belege bleiben unverändert zugeordnet.",
        grundPlaceholder: "Grund (optional), z. B. Verkauf",
        mitBelegen_one: "{{count}} Beleg bleibt zugeordnet.",
        mitBelegen_other: "{{count}} Belege bleiben zugeordnet.",
        bestaetigen: "Archivieren",
      },
      col: {
        steller: "Steller / Nr.",
        ges: "Ges.",
        datum: "Datum",
        ust: "USt",
        betrag: "Betrag",
        status: "Status",
      },
      ohneNr: "ohne Nr.",
      action: {
        mehr: "Weitere Aktionen",
        archivieren: "Archivieren",
        wiederherstellen: "Wiederherstellen",
        nochKorrekt: "Noch korrekt",
        ordnerOeffnen: "Ordner öffnen",
        bearbeiten: "Bearbeiten",
        abbrechen: "Abbrechen",
        speichern: "Speichern",
        speichere: "Speichere …",
        jetztAnlegen: "Jetzt anlegen",
      },
      // Beleg-Gesellschaft passt nicht zur hinterlegten Zuordnung des Objekts.
      gesellschaftAbweichung_one:
        "{{count}} Beleg ist auf eine Gesellschaft gebucht, der dieses Objekt nicht zugeordnet ist (zugeordnet: {{gesellschaften}}).",
      gesellschaftAbweichung_other:
        "{{count}} Belege sind auf Gesellschaften gebucht, denen dieses Objekt nicht zugeordnet ist (zugeordnet: {{gesellschaften}}).",
      gesellschaftAbweichungZeile: "Gesellschaft weicht von der Zuordnung dieses Objekts ab.",
      toast: {
        keineAenderungen: "Keine Änderungen.",
        gespeichert: "Gespeichert.",
        zuordnungGeaendert: "Gesellschaft(en) geändert.",
        geprueft: "Als geprüft markiert.",
        archiviert: "Objekt archiviert.",
        wiederhergestellt: "Objekt wiederhergestellt.",
        teilweiseGespeichert:
          "Stammdaten gespeichert, aber die Gesellschaft(en) konnten nicht aktualisiert werden: {{error}}",
        speichernFehlgeschlagen: "Speichern fehlgeschlagen: {{error}}",
      },
    },
  },

  // Bank transactions (Banktransaktionen) — list + detail, badges, match candidates.
  // Badge label keys are keyed by the DB enum value and mirror the META maps in format.ts.
  bankSettings: {
    title: "Bank-Einstellungen",
    nurAdmin: "Ändern darf diesen Wert nur ein Administrator.",
    ungespeichert: "Nicht gespeichert",
  },
  bank: {
    list: {
      title: "Banktransaktionen",
      subtitle: "Kontoumsätze aus BANKSapi, zum Abgleich mit Eingangsrechnungen.",
      bankkonten: "Bankkonten",
      sync: "Jetzt synchronisieren",
      syncing: "Synchronisiere …",
      syncDisabled:
        "Noch deaktiviert: BANKSapi ist noch nicht live, es gibt aktuell nichts Echtes zu synchronisieren.",
      search: "Suche (Verwendungszweck, Gegenkonto, Betrag) …",
      beleg: {
        vorhanden: "Beleg",
        titel: "Beleg vorhanden: {{quelle}}",
      },
      bezahltVonKurz: "Bezahlt von {{wer}}",
      filter: {
        beleg: "Beleg",
        alleBelege: "Alle",
        mitBeleg: "Mit Beleg",
        ohneBeleg: "Ohne Beleg",
        konto: "Konto",
        alleKonten: "Alle Konten",
        typ: "Umsatzart",
        alleTypen: "Alle Umsatzarten",
        richtung: "Richtung",
        alleRichtungen: "Alle Richtungen",
        abgleich: "Abgleich",
        alle: "Alle",
        quelle: "Quelle",
        alleQuellen: "Alle Quellen",
        button: "Filter",
        title: "Filter",
        reset: "Filter zurücksetzen",
      },
      zeileOeffnen: "Transaktion öffnen: {{gegenkonto}}, {{betrag}}",
      keineTreffer: "Keine Treffer",
      keineTrefferHint:
        "Keine Banktransaktion passt zu Suche und Filtern. Suchbegriff ändern oder Filter zurücksetzen.",
      filterZuruecksetzen: "Filter zurücksetzen",
      emptyTitle: "Keine Banktransaktionen",
      emptyHint:
        "Noch keine Umsätze importiert. Verbinde ein Konto unter „Bankverbindungen“ und starte einen Sync.",
      count_one: "{{count}} Transaktion",
      count_other: "{{count}} Transaktionen",
      updating: "aktualisiere …",
      col: {
        datum: "Datum",
        gegenkonto: "Gegenkonto",
        verwendungszweck: "Verwendungszweck",
        konto: "Konto",
        betrag: "Betrag",
        typ: "Umsatzart",
        abgleich: "Abgleich",
      },
      toast: {
        syncDone: "Sync abgeschlossen: {{neu}} neue Umsätze, {{vorschlaege}} Vorschläge.",
        syncFailed: "Sync fehlgeschlagen: {{error}}",
      },
    },
    matchingSettings: {
      // The heading asks the question the setting answers, so the field under it can stay short and
      // neither line needs the reader to know what "Zuordnung" or "Toleranz" mean. It replaced
      // "Zuordnungsregeln", which was plural and promised rules -- there is one, and it is a number.
      button: "Wann gilt eine Rechnung als bezahlt?",
      title: "Wann gilt eine Rechnung als bezahlt?",
      amountTolerance: "Erlaubte Zahlungsabweichung (€)",
      amountToleranceHint:
        "Eine Zahlung, die höchstens so weit abweicht, gilt weiterhin als diese Rechnung.",
      cancel: "Abbrechen",
      save: "Speichern",
      toastSuccess: "Gespeichert",
      toastError: "Speichern fehlgeschlagen. {{error}}",
      invalidTolerance: "Gültige Abweichung eingeben (z. B. 0.01 oder 0.50 €)",
    },
    detail: {
      back: "Banktransaktionen",
      notFoundTitle: "Transaktion nicht gefunden",
      toOverview: "Zur Übersicht",
      section: {
        belege: "Beleg zur Zahlung",
        transaktion: "Transaktion",
        passendeBelege: "Passende Belege",
        passendeAusgangsrechnungen: "Passende Ausgangsrechnungen",
      },
      // ---- invoice detail ----
      // Closing the remainder of a match that is already made. A write-off, so the reason is
      // required and ends up in the history.
      restschliessen: {
        aktion: "Rest abschließen",
        aktionZahlung: "Rest als verbraucht markieren",
        aktionRechnung: "Restbetrag abschreiben",
        titelZahlung: "Zahlung als vollständig verwendet markieren?",
        beschreibungZahlung:
          "Der Restbetrag gilt danach als verbraucht und die Zahlung verschwindet aus den offenen Posten. Rückgängig zu machen.",
        titelRechnung: "Rechnung als vollständig bezahlt markieren?",
        beschreibungRechnung:
          "Der Restbetrag gilt danach als abgeschrieben und die Rechnung verschwindet aus den offenen Posten.",
        betrag: "Es werden {{betrag}} abgeschrieben.",
        grund: "Grund",
        grundPlaceholder: "z. B. Skonto, Bankgebühr, Rundungsdifferenz",
        abbrechen: "Abbrechen",
        bestaetigen: "Rest abschließen",
        laeuft: "Wird gespeichert …",
        erledigt: "Restbetrag abgeschlossen.",
        offenZahlung: "Von dieser Zahlung sind {{betrag}} noch keiner Rechnung zugeordnet.",
        offenRechnung: "Von dieser Rechnung sind {{betrag}} noch durch keine Zahlung gedeckt.",
        istGeschlossen: "Restbetrag als verbraucht markiert.",
        istGeschlossenGrund: "Restbetrag als verbraucht markiert. Grund: {{grund}}",
        istAbgeschrieben: "Restbetrag abgeschrieben. Der Grund steht im Verlauf.",
        wiederOeffnen: "Wieder öffnen",
        wiederGeoeffnet: "Restbetrag wieder offen.",
        keineBerechtigung: "Dafür fehlt Ihnen die Berechtigung für Zahlungen.",
      },
      belegeHint:
        "Der Beleg, der zu dieser Buchung selbst gehört. Bei Kartenzahlungen fotografiert der Mitarbeiter ihn in Pleo; eine Rechnung gibt es dazu nicht.",
      belege: {
        nachfragen: "Jemanden benachrichtigen",
        hochladen: "Rechnung hochladen",
        uploadLaeuft: "Rechnung hochgeladen",
        uploadLaeuftHint:
          "Sie ist in der Warteschlange und wird in Kürze automatisch ins System übernommen.",
        uploadGelesen: "Rechnung übernommen",
        uploadGelesenHint: "Sie wird dieser Zahlung gerade zugeordnet.",
        uploadOeffnen: "Öffnen",
        neuerTab: "In neuem Tab öffnen",
        vorhanden: "Beleg hinterlegt",
        anzahl_one: "{{count}} Datei",
        anzahl_other: "{{count}} Dateien",
        vergroessern: "Vergrößern",
        vergroessernAria: "Beleg vergrößert anzeigen",
        nichtDarstellbar: "Dieser Dateityp ({{typ}}) kann hier nicht angezeigt werden.",
        keine: "Kein Beleg zu dieser Transaktion hinterlegt.",
        fehler: "Die Belege konnten nicht geladen werden.",
        datei: "Datei",
        herunterladen: "Herunterladen",
        quelle: "Aus {{quelle}} übernommen",
        zuordnen: "Vorhandene Rechnung zuordnen",
      },
      passendeBelegeHint:
        "Welche Rechnung diese Zahlung begleicht. Zuordnen verknüpft nur die Datensätze, es wird keine Zahlung ausgelöst.",
      // Gutschrift (migration 0045): confirming a match also updates the invoice's own paid
      // status via a DB trigger (migration 0085's sync_uploaded_outgoing_invoice_status_from_matches).
      passendeAusgangsrechnungenHint:
        "Welche Ausgangsrechnung durch diese Zahlung beglichen wird. Zuordnen aktualisiert den Zahlungsstatus der Rechnung automatisch.",
      keineGesellschaft: "Keine Gesellschaft",
      kategorieOhne: "Ohne Kategorie",
      kategorieRegel: "aus Regel",
      kategorieGutschrift: "Wird über die Ausgangsrechnung gebucht.",
      kategorieGespeichert: "Kategorie gespeichert.",
      kategorieFehlgeschlagen: "Kategorie konnte nicht gespeichert werden: {{error}}",
      row: {
        buchungsdatum: "Buchungsdatum",
        wertstellung: "Wertstellung",
        buchungstext: "Buchungstext",
        konto: "Konto",
        kontoIban: "Konto-IBAN",
        gesellschaft: "Gesellschaft",
        kategorie: "Kategorie (BWA)",
        gegenkonto: "Gegenpartei",
        iban: "IBAN",
        bic: "BIC",
        bezahltVon: "Bezahlt von",
        verwendungszweck: "Verwendungszweck",
      },
    },
    richtung: {
      ausgehend: "Ausgehend",
      eingehend: "Eingehend",
    },
    quelle: {
      banksapi: "Bank",
      pleo: "Pleo",
      manual: "Manuell",
    },
    // Umsatzart (transaction_type). Steuert den Abgleich: eine Überweisung wird von Hand
    // angestoßen und braucht vorher eine Freigabe, eine Kreditkartenabbuchung kommt als
    // Sammelbetrag und wird in ihre Einzelumsätze aufgeteilt, eine Lastschrift ist schon
    // eingezogen und wird nur leichter geprüft.
    transactionType: {
      ueberweisung: "Überweisung",
      lastschrift: "Lastschrift",
      kreditkarte: "Kreditkartenabbuchung",
      kartenzahlung: "Kartenzahlung",
      gutschrift: "Gutschrift",
      unbekannt: "Nicht klassifiziert",
    },
    matchStatus: {
      kandidat: "Vorschlag",
      auto: "Auto-Abgleich",
      bestaetigt: "Bestätigt",
      abgelehnt: "Abgelehnt",
    },
    matchScore: {
      confidence: {
        hoch: "Sehr wahrscheinlich der richtige Treffer",
        mittel: "Wahrscheinlich der richtige Treffer",
        niedrig: "Möglicherweise der richtige Treffer",
      },
      warum: "Warum vorgeschlagen:",
      signal: {
        amountTolerated: "Betrag (Abweichung {{differenz}})",
        amountToleratedPlain: "Betrag (innerhalb der erlaubten Abweichung)",
        amount: "Gleicher Betrag",
        reference: "Rechnungsnummer im Verwendungszweck",
        customerNumber: "Nur die Kundennummer, nicht diese Rechnung",
        iban: "Gleiche IBAN",
        name: "Gleicher Name",
        date: "Ähnliches Datum",
        company: "Gleiche Gesellschaft",
      },
      days_one: "{{count}} Tag",
      days_other: "{{count}} Tage",
    },
    txnMatching: {
      vorschlag: "Vorschlag prüfen",
      offen: "Offen",
      zugeordnet: "Zugeordnet",
      ignoriert: "Ignoriert",
    },
    abgleich: {
      offen: "Nicht abgeglichen",
      vorgeschlagen: "Vorschlag offen",
      teilweise: "Teilweise",
      abgeglichen: "Abgeglichen",
    },
    syncStatus: {
      active: "Aktiv",
      pending: "Ausstehend",
      error: "Fehler",
      expired: "Abgelaufen",
    },
    matches: {
      keineZahlBerechtigung:
        "Ein bestätigter Abgleich markiert die Rechnung als bezahlt. Dafür fehlt Ihnen die Berechtigung — bitte wenden Sie sich an jemanden, der Zahlungen buchen darf.",
      empty: "Kein passender Beleg gefunden.",
      // Invoice-seitiges Gegenstück zu "empty" oben: InvoiceMatches sucht Banktransaktionen statt
      // Belegen, braucht also einen eigenen Leertext statt "Kein passender Beleg ...".
      emptyTransactions: "Keine passende Zahlung gefunden.",
      beleg: "Beleg",
      belegEntfernt: "Beleg entfernt",
      transaktion: "Transaktion",
      transaktionEntfernt: "Transaktion entfernt",
      nr: "Nr. {{nr}}",
      ohneNr: "ohne Nr.",
      // Sammelzahlung: wie viel dieser Transaktion schon durch Belege erklärt ist (Migration 0024).
      zugeordnetVon: "{{zugeordnet}} von {{gesamt}} zugeordnet",
      restOffen: "{{rest}} ohne Beleg",
      davon: "davon {{betrag}}",
      gruppeAbgeglichen: "Bereits abgeglichen",
      gruppeVorschlaege: "Vorschläge zur Prüfung",
      gruppeAbgelehnt: "Als kein Treffer markiert",
      ablehnen: "Ablehnen",
      zuordnen: "Zuordnen",
      bestaetigenZahlung: "Bestätigen, diese Zahlung abgleichen",
      bestaetigenBeleg: "Bestätigen, diesen Beleg abgleichen",
      keinTreffer: "Kein Treffer",
      trennen: "Verknüpfung entfernen",
      trennenDialog: {
        grund: "Grund",
        title: "Zuordnung trennen?",
        desc: "Die Verknüpfung wird aufgehoben: Beleg und Transaktion gelten wieder als offen, und der Vorschlag bleibt bestehen und kann jederzeit erneut zugeordnet werden.",
        grundPlaceholder: "Warum stimmt die Zuordnung nicht?",
        abbrechen: "Abbrechen",
        bestaetigen: "Trennen",
      },
      reason: {
        amount: "Betrag",
        reference: "Referenz",
        iban: "IBAN",
        name: "Name",
        manual: "Manuell",
      },
      toast: {
        abgelehnt: "Als kein Treffer markiert. Der Vorschlag bleibt in der Liste.",
        getrennt: "Verknüpfung entfernt. Rechnung und Zahlung sind wieder offen.",
        bestaetigt: "Abgeglichen. Rechnung und Zahlung sind jetzt verknüpft.",
        fehlgeschlagen: "Fehlgeschlagen: {{error}}",
      },
    },
    manualImport: {
      button: "Manuell importieren",
      dialog: {
        title: "Bankumsätze manuell importieren",
        description:
          "Für Konten, die nicht über BANKSapi verbunden werden können: CSV, Excel- oder PDF-Datei hochladen.",
      },
      step: {
        account: "Konto",
        upload: "Datei",
        mapping: "Zuordnung",
        preview: "Vorschau",
        result: "Ergebnis",
      },
      account: {
        title: "Konto auswählen",
        existingLabel: "Bestehendes Konto",
        selectPlaceholder: "Konto auswählen …",
        noAccounts: "Noch kein manuelles Konto vorhanden.",
        createNew: "+ Neues Konto anlegen",
        backToList: "Bestehendes Konto wählen",
        continue: "Weiter",
      },
      accountForm: {
        company: "Gesellschaft",
        companyPlaceholder: "Gesellschaft auswählen …",
        accountName: "Kontobezeichnung",
        accountNamePlaceholder: "z. B. Sparkasse Girokonto",
        iban: "IBAN",
        bankName: "Kreditinstitut",
        bic: "BIC",
        submit: "Konto anlegen",
        submitting: "Lege an …",
        ibanConflict: "Für diese IBAN existiert bereits ein Konto. Bitte wähle es aus der Liste.",
        toastCreated: "Konto angelegt.",
      },
      upload: {
        title: "Datei hochladen",
        dropHint: "CSV-, Excel- oder PDF-Datei hierher ziehen oder auswählen",
        chooseFile: "Datei auswählen",
        formatsHint:
          "Unterstützt: CSV, XLSX, XLS, PDF (per KI-Erkennung). XML-Import (CAMT.053) folgt in einer späteren Version.",
        parsing: "Datei wird gelesen …",
        aiExtracting: "KI liest das PDF …",
      },
      mapping: {
        title: "Spalten zuordnen",
        hint: "Ordne die Spalten der Datei den passenden Feldern zu: Vorschläge sind bereits ausgefüllt.",
        field: {
          booking_date: "Buchungstag",
          value_date: "Wertstellung",
          amount: "Betrag",
          currency: "Währung",
          counterparty_holder: "Name Gegenkonto",
          counterparty_iban: "IBAN Gegenkonto",
          payment_reference: "Verwendungszweck",
          booking_text: "Buchungstext",
        },
        amountDebit: "Soll (Belastung)",
        amountCredit: "Haben (Gutschrift)",
        useSplitAmount: "Betrag ist auf zwei Spalten aufgeteilt (Soll/Haben)",
        columnPlaceholder: "Spalte wählen …",
        notMapped: "Nicht zugeordnet",
        required: "Pflichtfeld",
        continue: "Weiter zur Vorschau",
      },
      preview: {
        title: "Vorschau",
        summary: "{{count}} Umsätze · {{from}} – {{to}} · Summe {{sum}}",
        summaryShort: "{{count}} Umsätze · Summe {{sum}}",
        issuesTitle_one: "{{count}} Zeile übersprungen",
        issuesTitle_other: "{{count}} Zeilen übersprungen",
        aiWarning:
          "Diese Umsätze wurden per KI aus einem PDF gelesen. Bitte vor dem Import sorgfältig prüfen.",
        missingRequiredWarning_one:
          "{{count}} Zeile fehlt Datum oder Betrag. Bitte in der Tabelle ergänzen, bevor du importierst.",
        missingRequiredWarning_other:
          "{{count}} Zeilen fehlt Datum oder Betrag. Bitte in der Tabelle ergänzen, bevor du importierst.",
        fillIn: "Ausfüllen …",
        removeRow: "Zeile entfernen",
        lowConfidenceWarning_one:
          "{{count}} Zeile ist sich die KI nicht sicher. Bitte gegen das Original prüfen.",
        lowConfidenceWarning_other:
          "{{count}} Zeilen ist sich die KI nicht sicher. Bitte gegen das Original prüfen.",
        duplicateWarning_one: "{{count}} Zeile sieht wie ein mögliches Duplikat aus. Bitte prüfen.",
        duplicateWarning_other: "{{count}} Zeilen sehen wie mögliche Duplikate aus. Bitte prüfen.",
        col: {
          datum: "Datum",
          betrag: "Betrag",
          verwendungszweck: "Verwendungszweck",
          gegenkonto: "Gegenkonto",
        },
        back: "Zurück",
        import: "Importieren",
        importing: "Importiere …",
      },
      result: {
        title: "Import abgeschlossen",
        inserted: "{{count}} neu importiert",
        updated: "{{count}} aktualisiert",
        close: "Schließen",
      },
      errors: {
        parseFailed: "Datei konnte nicht gelesen werden: {{error}}",
        importFailed: "Import fehlgeschlagen: {{error}}",
        accountFailed: "Konto konnte nicht angelegt werden: {{error}}",
      },
    },
  },

  // Open items (Offene Posten) — invoices without a confirmed bank match + unmatched debits.
  offenePosten: {
    due: {
      // Short forms for the list's Fällig column, where the row already carries the date.
      short: {
        overdue: "Überfällig",
        today: "Heute",
        within_3_days: "In 3 Tagen",
        within_week: "Diese Woche",
      },
      any: "Alle Fristen",
      due_now: "Jetzt zu zahlen (überfällig oder heute)",
      overdue: "Überfällig",
      today: "Heute fällig",
      within_3_days: "In den nächsten 3 Tagen fällig",
      within_week: "Diese Woche fällig",
      later: "Später fällig",
      unknown: "Keine Frist bekannt",
    },
    skonto: {
      filter: "Skonto-Frist läuft bald ab",
      badge: "{{betrag}} sparen ({{prozent}} %)",
      title: "{{prozent}} % Skonto bei Zahlung bis {{datum}}",
      panel: "Skonto-Fristen",
      closing_one: "{{count}} Skonto-Frist läuft bald ab",
      closing_other: "{{count}} Skonto-Fristen laufen bald ab",
    },
    title: "Bankabgleich",
    subtitle: "Rechnungen mit Bankzahlungen abgleichen.",
    subtitleFehlend: "Banktransaktionen den passenden Rechnungen zuordnen.",
    ohneGesellschaft: "Ohne Gesellschaft",
    filterZuruecksetzen: "Filter zurücksetzen",
    // Same grouped-filters pattern as eingangsrechnungen (Popover + count badge + removable
    // chips), reused here even though there are only two fields, for a consistent filter UI
    // across list pages.
    filterButton: "Filter",
    filterChipEntfernen: "Filter entfernen",
    filterSchliessen: "Filter schließen",
    col: {
      // Decided with the user to match the mockup exactly: this column shows the customer name on
      // an outgoing-invoice row too, not just the supplier, but the label stays "Lieferant".
      gegenpartei: "Lieferant",
    },
    emptyTitle: "Keine offenen Posten",
    emptyHint:
      "Alle Rechnungen sind vollständig per Bankabgleich gedeckt, oder es sind noch keine vorhanden.",
    tab: {
      belege: "Rechnungen zuordnen",
      fehlend: "Zahlungen zuordnen",
    },
    // Belege, die diese Liste nie von selbst verlassen können: ohne Bruttobetrag gibt es nichts,
    // wogegen eine Zahlung gemessen werden könnte; eine Gutschrift ist Geld zurück und wird nicht
    // per Bankabgang gedeckt; privat bezahlt heißt, es wird nie einen Firmenkonto-Umsatz geben.
    // Sie werden gezählt und auf Wunsch angezeigt, nicht stillschweigend entfernt.
    blocker: {
      anzeigen_one: "{{count}} nicht abgleichbaren Beleg anzeigen",
      anzeigen_other: "{{count}} nicht abgleichbare Belege anzeigen",
      emptyTitle: "Keine nicht abgleichbaren Belege",
      emptyHint: "Zu jedem Beleg gibt es einen Bruttobetrag, gegen den eine Zahlung laufen kann.",
      label: {
        kein_betrag: "Kein Betrag",
        gutschrift: "Gutschrift",
        privat_bezahlt: "Privat bezahlt",
      },
      hint: {
        kein_betrag:
          "Ohne Bruttobetrag lässt sich keine Zahlung zuordnen. Betrag im Beleg nachtragen, dann erscheint er wieder unter den offenen Posten.",
        gutschrift:
          "Negativer Betrag: Geld kommt zurück. Eine Gutschrift wird nicht durch einen Bankabgang gedeckt.",
        privat_bezahlt:
          "Privat bezahlt. Dazu wird es nie einen Umsatz auf einem Firmenkonto geben.",
      },
    },
    belege: {
      filter: {
        label: "Rechnungstyp",
        dringlichkeit: "Zahlungsfrist",
        alle: "Alle Rechnungstypen",
        incoming: "Eingangsrechnungen",
        outgoing: "Ausgangsrechnungen",
      },
      // Shown short ("Rechnung oder Lieferant suchen"), searches wide: gegenpartei, invoice
      // number, company, property, cost category and amount (see suchtextFuer in index.tsx) —
      // the placeholder names the common case, the search itself stays as capable as before.
      gegenparteiPlaceholder: "Rechnung oder Lieferant suchen",
      // Teilzahlung: die Rechnung bleibt offen, bis die Summe stimmt.
      restOffen: "Teilweise bezahlt: {{bezahlt}} bezahlt, {{rest}} noch zu zahlen",
      emptyTitle: "Keine offenen Belege",
      emptyHint:
        "Alle Belege sind vollständig per Bankabgleich gedeckt, oder es sind noch keine Belege vorhanden.",
      gefiltertEmptyTitle: "Keine Treffer",
      gefiltertEmptyHint: "Zu diesen Filtern gibt es keinen offenen Posten. Filter zurücksetzen?",
      col: {
        nr: "Rechnung",
        betrag: "Betrag",
        rechnungsdatum: "Rechnungsdatum",
        // Ein Fälligkeitsdatum steht heute an keinem Beleg (die Pipeline liest keines aus). Damit
        // die Spalte trotzdem etwas sagt, zeigt sie ersatzweise, wie lange der Beleg schon liegt
        // (siehe FaelligZelle) -- der Spaltenkopf bleibt bewusst schlicht "Fällig".
        faelligAlter: "Fällig",
      },
      ueberfaellig: "Überfällig",
      ueberfaelligTage_one: "{{count}} Tag überfällig",
      ueberfaelligTage_other: "{{count}} Tage überfällig",
      faelligAm: "Fällig am {{datum}}",
      offenSeit_one: "seit {{count}} Tag offen",
      offenSeit_other: "seit {{count}} Tagen offen",
      zurListe:
        "Ausgangsrechnungen haben keine Detailseite. In der Liste der Ausgangsrechnungen öffnen.",
      // Öffnet das Match-Panel für diese Zeile (siehe matchPanel.* oben).
      verknuepfen: "Zahlung zuordnen",
    },
    // Ausgangsrechnungen-Spiegel (Migration 0045) — dieselbe "offen, bis vollständig gedeckt"-Logik
    // wie oben, nur für die Umsatzseite; teilt sich die Spalten oben (EINE Tabelle, Typ-Spalte statt
    // zwei getrennte). Die Zeile führt in
    // die Liste der Ausgangsrechnungen, weil es hier keine eigene Detailseite gibt.
    ausgangsrechnungen: {
      emptyTitle: "Keine offenen Ausgangsrechnungen",
      emptyHint:
        "Alle Ausgangsrechnungen sind vollständig per Bankabgleich gedeckt, oder es sind noch keine vorhanden.",
    },
    fehlend: {
      filter: {
        alleRichtungen: "Alle Richtungen",
        alleQuellen: "Alle Quellen",
        eingehend: "Eingehend (Gutschriften)",
        ausgehend: "Ausgehend (Abgänge)",
      },
      // Teilweise erklärte Sammelzahlung: bleibt in der Liste, bis alles belegt ist.
      restOffen: "{{rest}} ohne Beleg ({{zugeordnet}} zugeordnet)",
      emptyTitle: "Keine offenen Banktransaktionen",
      emptyHint:
        "Zu allen ausgehenden Bankabgängen gibt es einen zugeordneten Beleg, oder es sind noch keine Umsätze importiert.",
      gefiltertEmptyTitle: "Keine Treffer",
      gefiltertEmptyHint:
        "Zu diesen Filtern gibt es keine offene Banktransaktion. Filter zurücksetzen?",
      col: {
        quelle: "Quelle",
        datum: "Datum",
        richtung: "Richtung",
        gesellschaft: "Gesellschaft",
        gegenkonto: "Gegenkonto",
        verwendungszweck: "Verwendungszweck",
        betrag: "Betrag",
        // Kategorie einer beleglosen Transaktion — automatisch aus einer gelernten
        // Zuordnungsregel gesetzt (Migration 0030/0057) oder von Hand korrigiert.
        kategorie: "Kategorie",
      },
      quelle: {
        banksapi: "Bank",
        pleo: "Pleo",
      },
      // Öffnet das Match-Panel für diese Zeile (siehe matchPanel.* oben).
      belegFinden: "Rechnung zuordnen",
      kategorieOhne: "Ohne Kategorie",
      kategoriePlaceholder: "Kategorie wählen",
      kategorieRegel: "Regel",
      kategorieRegelHint:
        "Automatisch aus einer gelernten Zuordnungsregel gesetzt. Von Hand korrigierbar.",
      kategorieGesetzt: "Kategorie gespeichert",
      kategorieEntfernt: "Kategorie entfernt",
      kategorieFehler: "Kategorie konnte nicht gespeichert werden: {{error}}",
      versteckt: "{{count}} Transaktion(en) ausgeblendet (kein Beleg zu erwarten).",
      verstecktLink: "Ausgeblendete anzeigen",
      alleGesellschaften: "Alle Gesellschaften",
      gegenparteiPlaceholder: "Lieferant oder Verwendungszweck suchen",
    },
  },

  // Zeilenbezogenes Match-Panel (offene-posten): ersetzt den alten Reiter "Manuell verknüpfen".
  // Öffnet sich pro Zeile, zeigt vorgeschlagene Treffer (InvoiceMatches/TransactionMatches, siehe
  // bank.matches.*) und bietet darunter eine manuelle Suche als Ausweichmöglichkeit.
  matchPanel: {
    infoInvoice:
      "Wählen Sie die Bankzahlung, mit der diese Rechnung beglichen wurde. Oben stehen die Zahlungen, die am ehesten passen. Ist die richtige nicht dabei, suchen Sie nach Lieferant, Verwendungszweck oder Betrag.",
    infoTransaction:
      "Wählen Sie die Rechnung, die mit dieser Zahlung beglichen wurde. Oben stehen die Rechnungen, die am ehesten passen. Ist die richtige nicht dabei, suchen Sie nach Lieferant, Nummer oder Betrag.",
    invoiceTitle: "Zahlung zur Rechnung zuordnen",
    teilzahlungHinweis:
      "Ein Teil dieser Rechnung ist schon bezahlt. {{rest}} müssen noch bezahlt werden. Sobald das passiert ist, suchen Sie die Zahlung und ordnen Sie sie hier zu.",
    teilzahlungSuchen: "Fehlende Zahlung suchen",
    transactionTitle: "Rechnung zur Zahlung zuordnen",
    nr: "Nr. {{nr}}",
    documentDate: "Rechnungsdatum: {{datum}}",
    dueDate: "Fällig: {{datum}}",
    suggestedHeading: "Vorgeschlagene Treffer",
    findPaymentHeading: "Zahlung finden",
    findInvoiceHeading: "Beleg finden",
    noMatchQuestionTransactions: "Keine passende Zahlung gefunden?",
    zurueckZuVorschlaegen: "Zurück zu den Vorschlägen",
    searchAllTransactions: "In allen Banktransaktionen suchen",
    noMatchQuestionInvoices: "Keinen passenden Beleg gefunden?",
    searchAllInvoices: "In allen Belegen suchen",
    searchPlaceholderTransactions: "Nach Lieferant, Verwendungszweck oder Betrag suchen",
    searchEmptyTransactions: "Keine offene Zahlung passt dazu.",
    searchEmptyIncoming: "Kein offener Eingangsbeleg passt dazu.",
    searchEmptyOutgoing: "Es wurden noch keine Ausgangsrechnungen angelegt.",
    searchPlaceholderIncoming: "Beleg nach Lieferant, Nummer oder Betrag suchen",
    searchPlaceholderOutgoing: "Ausgangsrechnung nach Nummer oder Betrag suchen",
    loadMore: "Weitere Ergebnisse werden geladen …",
    link: "Verknüpfen",
    linked: "Abgeglichen. Rechnung und Zahlung sind jetzt verknüpft.",
    linkFailed: "Abgleich fehlgeschlagen: {{error}}",
    linking: "Wird abgeglichen …",
  },

  // OPOS-Whitelist (opos_whitelist_rules, Pipeline-Migration 0018) — Buchungen, zu denen es NIE
  // einen Beleg gibt. Ohne diese Liste ist die Offene-Posten-Liste nach einer Woche unbrauchbar
  // (Briefing Screen 10).
  oposWhitelist: {
    list: {
      title: "Ausgeschlossene Zahlungen",
      nurLesen:
        "Regeln gelten für alle Gesellschaften. Anlegen, Ändern und Löschen ist Admins und Supervisoren vorbehalten.",
      empty: "Noch keine Regeln angelegt.",
      keineTreffer: "Keine Regel passt zu den Filtern.",
      count_one: "{{count}} Regel",
      count_other: "{{count}} Regeln",
      angelegtVon: "Angelegt am {{datum}} von {{person}}",
      unbekannt: "unbekannt",
      col: {
        category: "Kategorie",
        scope: "Feld",
        term: "Suchbegriff",
        hits: "Ausgeblendete Zahlungen",
        note: "Notiz",
        angelegt: "Angelegt",
        active: "Aktiv",
      },
      neu: { button: "Regel anlegen" },
      action: { loeschen: "Regel löschen", bearbeiten: "Regel bearbeiten" },
    },
    filter: {
      button: "Filter",
      title: "Filter",
      suche: "Suchbegriff oder Notiz durchsuchen",
      kategorieAlle: "Alle Kategorien",
      statusAlle: "Aktiv und inaktiv",
      statusAktiv: "Nur aktive",
      statusInaktiv: "Nur inaktive",
      trefferAlle: "Blendet aus oder nicht",
      trefferMit: "Blendet Zahlungen aus",
      trefferOhne: "Blendet nichts aus",
      zuruecksetzen: "Filter zurücksetzen",
    },
    ueberdeckt: "Zählt nie: „{{regel}}“ ist älter und greift zuerst",
    category: {
      salary: "Lohn/Gehalt",
      tax_prepayment: "Steuervorauszahlung",
      private_withdrawal: "Privatentnahme",
      rebooking: "Umbuchung",
      loan_installment: "Darlehensrate",
      fee_interest: "Bankgebühr/Zinsen",
      atm_withdrawal: "Bargeldabhebung",
      other: "Sonstiges",
    },
    scope: {
      reference: "Verwendungszweck",
      counterparty: "Gegenkonto (Name)",
      iban: "Gegenkonto (IBAN)",
      booking_text: "Buchungstext",
      any: "Beliebiges Feld",
    },
    toggle: {
      aktiviert: "Regel aktiviert.",
      deaktiviert: "Regel deaktiviert.",
      hinweisNeuBewerten:
        "Bereits ausgeblendete Buchungen bleiben ausgeblendet, bis Sie „Buchungen neu bewerten“ ausführen.",
      fehlgeschlagen: "Umschalten fehlgeschlagen: {{error}}",
    },
    neuBewerten: {
      button: "Buchungen neu bewerten",
      titel: "Ausgeblendete Buchungen neu bewerten?",
      beschreibung:
        "Alle Buchungen, die aktuell durch eine Regel ausgeblendet sind, werden erneut gegen die aktiven Regeln geprüft. Was keine Regel mehr trifft, taucht wieder in den offenen Posten auf. Von Hand ausgeblendete Buchungen und bereits zugeordnete Zahlungen bleiben unberührt.",
      abbrechen: "Abbrechen",
      bestaetigen: "Neu bewerten",
      laeuft: "Wird geprüft …",
      toastOk_one: "{{count}} Buchung neu bewertet.",
      toastOk_other: "{{count}} Buchungen neu bewertet.",
      toastFehler: "Neu bewerten fehlgeschlagen: {{error}}",
    },
    vorschau: {
      laeuft: "Treffer werden gezählt …",
      fehler: "Treffer konnten nicht gezählt werden.",
      keine: "Trifft aktuell keine der {{gesamt}} ausgehenden Buchungen.",
      treffer:
        "Blendet aktuell {{anzahl}} von {{gesamt}} ausgehenden Buchungen aus ({{prozent}} %, geschätzt).",
    },
    dialog: {
      neu: {
        title: "Neue Whitelist-Regel",
        desc: "Buchungen, die diesen Begriff enthalten, erwarten keinen Beleg mehr.",
      },
      bearbeiten: {
        title: "Regel bearbeiten",
        desc: "Änderungen gelten ab sofort für neue Treffer. Bereits ausgeblendete Buchungen bewerten Sie über „Buchungen neu bewerten“ neu.",
      },
      field: { category: "Kategorie", scope: "Feld", term: "Suchbegriff", note: "Notiz" },
      termPlaceholder: "z. B. Kontoführungsgebühr",
      termHinweis:
        "Möglichst genau wählen, der Begriff wird als Teiltext gesucht: „Lohn“ trifft auch „Lohnert GmbH“.",
      termZuKurz: "Mindestens {{min}} Zeichen, sonst trifft die Regel fast jeden Buchungstext.",
      umlautHinweis:
        "Umlaute werden nicht automatisch übersetzt. Zusätzlich eine Regel für „{{ascii}}“ anlegen, damit auch diese Schreibweise erfasst wird.",
      notePlaceholder: "Warum gibt es hier keinen Beleg?",
      cancel: "Abbrechen",
      save: "Anlegen",
      saveEdit: "Speichern",
      saving: "Speichern …",
      toast: {
        termPflicht: "Bitte einen Suchbegriff eingeben.",
        termZuKurz: "Der Suchbegriff braucht mindestens {{min}} Zeichen.",
        angelegt: "Regel angelegt.",
        angelegtBeide: "Regel angelegt, zusätzlich für „{{zweite}}“.",
        gespeichert: "Regel gespeichert.",
        anlegenFehlgeschlagen: "Anlegen fehlgeschlagen: {{error}}",
        speichernFehlgeschlagen: "Speichern fehlgeschlagen: {{error}}",
      },
    },
    delete: {
      title: "Regel löschen?",
      desc: "„{{term}}“ ({{category}}) wird deaktiviert und aus der Liste entfernt.",
      freigeben_one:
        "Die {{count}} aktuell ausgeblendete Buchung wieder freigeben, sonst bleibt sie ohne erkennbare Regel ausgeblendet.",
      freigeben_other:
        "Die {{count}} aktuell ausgeblendeten Buchungen wieder freigeben, sonst bleiben sie ohne erkennbare Regel ausgeblendet.",
      grund: "Löschgrund",
      grundPlatzhalter: "Warum wird diese Regel entfernt?",
      cancel: "Abbrechen",
      confirm: "Löschen",
      laeuft: "Wird gelöscht …",
      toast: {
        geloescht: "Regel gelöscht.",
        freigebenFehlgeschlagen:
          "Regel gelöscht, aber die ausgeblendeten Buchungen konnten nicht freigegeben werden. „Buchungen neu bewerten“ holt das nach.",
        freigegeben_one: "{{count}} Buchung wieder freigegeben.",
        freigegeben_other: "{{count}} Buchungen wieder freigegeben.",
        fehlgeschlagen: "Löschen fehlgeschlagen: {{error}}",
      },
    },
  },

  // Bank-Sync-Protokoll-Panel — Filter, Pagination, Auto-Refresh (components/bank/sync-log-panel.tsx).
  syncLog: {
    refreshNow: "Aktualisieren",
    refresh: {
      off: "Kein Auto-Refresh",
      everyN: "Alle {{n}} Min.",
      nextIn: "nächste Aktualisierung in {{time}}",
      refreshing: "aktualisiere …",
    },
    filter: {
      button: "Filter",
      title: "Protokoll filtern",
      ereignis: "Ereignis",
      stufe: "Stufe",
      verbindung: "Verbindung",
      zeitraum: "Zeitraum",
      allEvents: "Alle Ereignisse",
      allLevels: "Alle Stufen",
      allConnections: "Alle Verbindungen",
      reset: "Filter zurücksetzen",
    },
    col: { connection: "Verbindung" },
    emptyTitle: "Keine Protokoll-Einträge",
    emptyHint: "Zu diesen Filtern gibt es nichts, oder es lief noch kein Sync.",
  },

  // Hinweis auf einem Beleg, der aus einem Sammelscan herausgeschnitten wurde (Migration 0009/0020).
  splitOrigin: {
    text: "Dieser Beleg stammt aus einem Sammelscan mit mehreren Belegen.",
    textWithPages:
      "Dieser Beleg stammt aus einem Sammelscan, hier sind Seite(n) {{pages}} des Originals.",
    mailAttachment:
      "Dieser Beleg war ein Anhang einer E-Mail mit mehreren Dokumenten. Ein Original-Scan existiert dafür nicht.",
    showOriginal: "Original-Scan ansehen",
    dialogTitle: "Vollständiger Original-Scan",
  },

  // Manuelles Verknüpfen von Beleg ↔ Banktransaktion (Briefing Screen 8). Die Konfidenz stammt aus
  // demselben scoreMatch(), das auch der automatische Abgleich nutzt.
  manualLink: {
    trigger: "Manuell verknüpfen",
    belowThreshold:
      "unter den 0,60, die der Abgleich verlangt, er würde dieses Paar nicht vorschlagen",
    sort: {
      label: "Sortierung",
      date: "Datum",
      amount: "Betrag",
      name: "Name",
      desc: "Neueste zuerst",
      asc: "Älteste zuerst",
    },
    filters: "Datum",
    filtersHint: "Beide Zeiträume gelten gemeinsam, einen leer lassen, um ihn zu ignorieren.",
    dateShort: {
      document_date: "Rg",
      created_at: "Eing",
      booking_date: "Buch",
      value_date: "Wert",
    },
    dateField: {
      document_date: "Rechnungsdatum",
      created_at: "Eingangsdatum",
      booking_date: "Buchungsdatum",
      value_date: "Wertstellung",
    },
    dateFrom: "von",
    dateTo: "bis",
    dateClear: "Datum zurücksetzen",
    detail: {
      invoiceNumber: "Rechnungsnummer",
      customerNumber: "Kundennummer",
      issuer: "Rechnungssteller",
      supplierIban: "IBAN des Lieferanten",
      net: "Netto",
      vat: "USt.",
      gross: "Brutto",
      documentDate: "Rechnungsdatum",
      dueDate: "Fällig",
      company: "Gesellschaft",
      property: "Objekt",
      paymentMethod: "Zahlungsart",
      customer: "Kunde",
      counterparty: "Gegenkonto",
      counterpartyIban: "IBAN Gegenkonto",
      bic: "BIC",
      amount: "Betrag",
      bookingDate: "Buchungsdatum",
      valueDate: "Wertstellung",
      bookingText: "Buchungstext",
      reference: "Verwendungszweck",
    },
    title: "Beleg mit Banktransaktion verknüpfen",
    desc: "Je einen offenen Beleg und eine offene Banktransaktion wählen. Die Konfidenz wird genauso berechnet wie beim automatischen Abgleich.",
    invoiceSide: "Offene Belege ({{count}})",
    outgoingInvoiceSide: "Offene Ausgangsrechnungen ({{count}})",
    txnSide: "Offene Banktransaktionen ({{count}})",
    searchInvoice: "Rechnungssteller, Nr., Betrag …",
    searchOutgoingInvoice: "Kunde, Nr., Betrag …",
    searchTxn: "Gegenkonto, Verwendungszweck, Betrag …",
    noInvoice: "Kein passender Beleg.",
    noOutgoingInvoice: "Keine passende Ausgangsrechnung.",
    noTxn: "Keine passende Transaktion.",
    loadingSide: "Wird geladen …",
    loadingMore: "Weitere werden geladen …",
    pickBoth: "Beide Seiten wählen, um die Konfidenz zu sehen.",
    nochNichtGewaehlt: "noch nicht gewählt",
    auswahlAufheben: "Auswahl aufheben",
    // Vorher der untranslated Literal "Details", auf jeder Zeile identisch.
    detailsToggle: "Details zu {{name}} ein-/ausblenden",
    band: {
      auto: "Sichere Zuordnung",
      kandidat: "Kandidat",
      schwach: "Schwach, der Abgleich würde das nicht vorschlagen",
    },
    reason: {
      amount: "Betrag",
      reference: "Verwendungszweck",
      iban: "IBAN",
      name: "Name",
    },
    dayDiff: "{{n}} Tage Differenz",
    weakWarning:
      "Ohne Treffer bei Betrag oder Verwendungszweck würde der automatische Abgleich dieses Paar nie vorschlagen. Bitte genau prüfen.",
    link: "Verknüpfen",
    // Bestätigung vor dem Schreiben: sagt vorher, was die Verknüpfung auslöst.
    confirm: {
      close: {
        rechnung: "Rechnung als vollständig bezahlt markieren",
        rechnungHint: "Die offenen {{rest}} werden nicht mehr erwartet.",
        transaktion: "Transaktion als vollständig verwendet markieren",
        transaktionHint: "Die freien {{rest}} stehen keiner weiteren Rechnung mehr zur Verfügung.",
        grund: "Grund",
        grundPlatzhalter: "z. B. Skonto, Rundungsdifferenz, Bankgebühr",
      },
      info: "Die Zuordnung löst keine Zahlung aus. Sie hält fest, dass diese Zahlung diese Rechnung begleicht, setzt die Rechnung auf bezahlt, sobald sie vollständig gedeckt ist, und lässt einen Restbetrag der Zahlung für eine weitere Rechnung frei.",
      title: "Treffer bestätigen",
      intro: "Was passiert:",
      rechnung: "Rechnung",
      ausgangsrechnung: "Ausgangsrechnung",
      transaktion: "Banktransaktion",
      betrag: "Zugeordneter Betrag",
      ohneNr: "ohne Nr.",
      restRechnung: "Rest auf der Rechnung",
      restZahlung: "Rest auf der Banktransaktion",
      folge: {
        bezahlt: "Die Rechnung ist damit vollständig bezahlt.",
        bezahltSkonto:
          "Die Rechnung ist damit vollständig bezahlt. {{differenz}} gelten als Skonto.",
        teilweise: "Die Rechnung ist damit nicht vollständig bezahlt. {{rest}} bleiben unbezahlt.",
        transaktionVoll: "Die gesamte Banktransaktion wird für diese Rechnung verwendet.",
        transaktionAbgeschlossen:
          "Die restlichen {{rest}} werden abgeschlossen und keiner weiteren Rechnung zugeordnet.",
        transaktionRest: "{{rest}} der Banktransaktion bleiben für eine andere Rechnung frei.",
        // Outgoing invoices: confirming a match sets the invoice's own paid status locally now
        // (migration 0085's sync_uploaded_outgoing_invoice_status_from_matches trigger), same as
        // an incoming invoice — no external system of record anymore.
        bezahltOutgoing: "Der Kunde hat diese Rechnung damit vollständig bezahlt.",
        teilweiseOutgoing: "Der Kunde hat nicht vollständig bezahlt. {{rest}} bleiben offen.",
      },
      abbrechen: "Abbrechen",
      bestaetigen: "Abgleichen",
      differenceReason: {
        label: "Differenzgrund (für Buchhaltung)",
        markFullyPaid: "Rechnung vollständig als bezahlt/ausgeglichen markieren",
        skonto: "Gewährter Skonto",
        rundungsdifferenz: "Rundungsdifferenz / Cent-Betrag",
        bankgebuehren: "Bankgebühren / Abzüge",
        teilzahlung: "Teilzahlung (Rest bleibt offen)",
        sonstiges: "Sonstiges",
      },
    },
    // Teilweise erledigte Zeilen bleiben in der Liste, bis nichts mehr offen ist.
    rest: {
      offen: "{{betrag}} offen",
      bezahlt: "{{betrag}} bezahlt",
      frei: "{{betrag}} frei",
      zugeordnet: "{{betrag}} zugeordnet",
    },
    // Teilbetrag je Verknüpfung (Migration 0024). Eine Sammelzahlung wird auf mehrere Rechnungen
    // verteilt, eine Ratenzahlung deckt nur einen Teil.
    betrag: {
      label: "Betrag dieser Verknüpfung",
      rechnungOffen: "Rechnung offen",
      ausgangsrechnungOffen: "Ausgangsrechnung offen",
      transaktionFrei: "Transaktion frei",
      // Deckungsbalken: wie viel dieser Verknüpfung von einer Seite aufgeht, und was danach bleibt.
      vonGesamt: "{{betrag}} von {{gesamt}}",
      danachOffen: "danach noch {{rest}} offen",
      danachGedeckt: "danach vollständig gedeckt",
      danachFrei: "danach noch {{rest}} frei",
      danachVerbraucht: "danach vollständig zugeordnet",
      deckt: "Deckt die Rechnung vollständig ab und markiert sie als bezahlt.",
      decktOutgoing: "Deckt die Ausgangsrechnung vollständig ab.",
      teilzahlung:
        "Teilzahlung: danach bleiben {{rest}} offen. Bezahlt erst, wenn die Summe stimmt.",
      teilzahlungOutgoing:
        "Teilzahlung: danach bleiben {{rest}} offen. Vollständig gedeckt erst, wenn die Summe stimmt.",
      skonto:
        "Innerhalb der Skonto-Toleranz ({{differenz}} Abzug), die Rechnung gilt damit als bezahlt.",
      skontoOutgoing:
        "Innerhalb der Toleranz ({{differenz}} Differenz) gilt die Ausgangsrechnung als vollständig gedeckt.",
      ungueltig: "Für diese Auswahl ist auf keiner Seite noch etwas offen.",
    },
    linking: "Verknüpfe …",
    cancel: "Abbrechen",
    toast: {
      verknuepft:
        "Verknüpft. Beleg und Transaktion sind aus den offenen Posten verschwunden; konkurrierende Vorschläge wurden zurückgezogen.",
      verknuepftOutgoing:
        "Verknüpft. Ausgangsrechnung und Transaktion sind aus den offenen Posten verschwunden; konkurrierende Vorschläge wurden zurückgezogen.",
      fehlgeschlagen: "Verknüpfen fehlgeschlagen: {{error}}",
    },
  },

  // Manuelles Ausblenden einer einzelnen Buchung ("kein Beleg zu erwarten").
  noReceipt: {
    action: {
      keinBeleg: "Dazu gibt es keine Rechnung",
      wiederAufnehmen: "Wieder in die Liste aufnehmen",
      grundWaehlen: "Grund wählen",
    },
    detail: {
      grund: "Kein Beleg zu erwarten: {{grund}}.",
      durchRegel: "Ausgeblendet durch eine Whitelist-Regel.",
      manuell: "Manuell ausgeblendet von {{actor}}.",
    },
    toast: {
      versteckt: "Buchung ausgeblendet, kein Beleg zu erwarten.",
      wiederAufgenommen: "Buchung wieder in den offenen Posten.",
      fehlgeschlagen: "Aktion fehlgeschlagen: {{error}}",
    },
  },

  // Root-level fallback screens (404 + error boundary).
  errorPage: {
    notFoundTitle: "Seite nicht gefunden",
    notFoundBody: "Die gesuchte Seite existiert nicht oder wurde verschoben.",
    goHome: "Zur Startseite",
    errorTitle: "Diese Seite konnte nicht geladen werden",
    errorBody:
      "Auf unserer Seite ist etwas schiefgelaufen. Aktualisiere die Seite oder gehe zurück zur Startseite.",
    tryAgain: "Erneut versuchen",
  },

  // Upload page (Beleg hochladen).
  upload: {
    back: "Eingangsrechnungen",
    title: "Beleg hochladen",
    subtitle:
      "Dateien hierher ziehen oder auswählen. Lieferant, Betrag, Datum, Gesellschaft und Objekt werden automatisch ausgelesen, damit Sie kaum etwas eintippen müssen.",
    dropRelease: "Jetzt loslassen …",
    dropHint: "Dateien hierher ziehen",
    fileTypes: "PDF, JPG, PNG oder XML · mehrere Dateien möglich",
    chooseFiles: "Dateien auswählen",
    selectedCount: "{{count}} Datei(en) ausgewählt",
    removeAll: "Alle entfernen",
    removeAllTitle: "Alle Dateien entfernen?",
    removeAllDesc:
      "Alle ausgewählten Dateien werden aus der Liste entfernt. Bereits hochgeladene Belege bleiben erhalten.",
    removeAllCancel: "Abbrechen",
    removeAllConfirm: "Alle entfernen",
    savedTag: "· hochgeladen",
    removeFile: "Datei entfernen",
    cancelFile: "Abbrechen",
    toOverview: "Zur Übersicht",
    cancel: "Abbrechen",
    uploading: "Lade hoch …",
    uploadN: "{{count}} Beleg(e) hochladen",
    uploadGeneric: "Hochladen",
    footer:
      "Ihre Originaldatei bleibt unverändert erhalten. Die Angaben werden in wenigen Minuten automatisch ausgelesen.",
    toast: {
      tooBig: "{{count}} Datei(en) zu groß (max. {{limit}}).",
      ignored: "{{count}} Datei(en) ignoriert. Nur PDF, JPG, PNG, XML erlaubt.",
      saved_one: "Beleg hochgeladen. Die Angaben werden gleich automatisch ausgelesen.",
      saved_other:
        "{{count}} Belege hochgeladen. Die Angaben werden gleich automatisch ausgelesen.",
      failed: "Upload fehlgeschlagen: {{error}}",
    },
  },

  // Outgoing invoices (Ausgangsrechnungen) — placeholder page.
  ausgangsrechnungen: {
    title: "Ausgangsrechnungen",
    subtitle: "Ausgangsrechnungen werden manuell hochgeladen und automatisch ausgelesen.",
    status: {
      entwurf: "Entwurf",
      offen: "Offen",
      ueberfaellig: "Überfällig",
      bezahlt: "Bezahlt",
      storniert: "Storniert",
    },
    list: {
      queue: {
        offen: { label: "Offen", desc: "Gestellt, noch nicht bezahlt" },
        ueberfaellig: { label: "Überfällig", desc: "Das Zahlungsziel ist abgelaufen" },
        bezahlt: { label: "Bezahlt", desc: "Vom Kunden beglichen" },
      },
      // KPI tiles, the same row the incoming-invoice screen has.
      kpi: {
        gesamt: "Rechnungen",
        offen: "Offen",
        ueberfaellig: "Überfällig",
        volumen: "Volumen (Brutto)",
        volumenHint: "Brutto-Summe aller Rechnungen in dieser Auswahl, stornierte ausgenommen.",
        // The line under the KPI row. Not a fourth card: a card is a filter, and this is a total.
        volumenZeile_one: "{{count}} Rechnung, {{summe}} brutto",
        volumenZeile_other: "{{count}} Rechnungen, {{summe}} brutto",
        offenerBetrag: "Noch offen",
        offenerBetragHint:
          "Brutto-Summe der offenen und überfälligen Rechnungen, also was noch hereinkommen muss.",
      },
      search: "Kunde oder Rechnungsnummer suchen …",
      entwurf: "Entwurf",
      empty: "Keine Ausgangsrechnungen gefunden.",
      dateiAnsehen: "Datei ansehen",
      dateiFehlgeschlagen: "Die Datei konnte nicht geöffnet werden.",
      dateiFehlgeschlagenMitFehler: "Die Datei konnte nicht geöffnet werden: {{error}}",
      statusFehlgeschlagen: "Status konnte nicht geändert werden: {{error}}",
      filter: {
        gesellschaft: "Gesellschaft",
        alleGesellschaften: "Alle Gesellschaften",
        status: "Status",
        alleStatus: "Alle",
      },
      col: {
        nr: "Nr.",
        kunde: "Kunde",
        gesellschaft: "Gesellschaft",
        datum: "Datum",
        faellig: "Fällig",
        betrag: "Betrag",
        status: "Status",
      },
      delete: {
        button: "Löschen",
        title: "Ausgangsrechnung löschen?",
        desc: "Die Rechnung wird ausgeblendet, bleibt aber revisionssicher gespeichert (im Papierkorb wiederherstellbar). Optional ein Grund:",
        grundPlaceholder: "Grund (optional), z. B. versehentlich doppelt angelegt",
        cancel: "Abbrechen",
        confirm: "Löschen",
        toastOk: "Ausgangsrechnung gelöscht (im Papierkorb wiederherstellbar).",
        toastFehlgeschlagen: "Löschen fehlgeschlagen: {{error}}",
      },
    },
    hochladen: {
      button: "Rechnung hochladen",
      zurueck: "Ausgangsrechnungen",
      title: "Ausgangsrechnung hochladen",
      subtitle: "Datei hochladen, KI liest die Angaben aus, prüfen und speichern.",
      dropHint: "Rechnung hierher ziehen",
      dropRelease: "Datei loslassen zum Hochladen",
      fileTypes: "PDF, JPG oder PNG, max. 15 MB",
      chooseFile: "Datei auswählen",
      analysiere: "KI liest die Rechnung …",
      abgelehnt: {
        title: "Dokument nicht erkannt",
        andereDatei: "Andere Datei wählen",
      },
      feld: {
        gesellschaft: "Gesellschaft",
        gesellschaftPlaceholder: "Gesellschaft wählen …",
        rechnungsnummer: "Rechnungsnummer",
        kunde: "Kunde",
        kundePlaceholder: "Kunde wählen …",
        kundeErstGesellschaft: "Erst Gesellschaft wählen",
        keinKunde: "Kein Kunde gefunden.",
        neuerKundeLink: "Neuen Kunden anlegen",
        bestehenderKundeLink: "Bestehenden Kunden wählen",
        kundeName: "Name",
        kundeAdresse: "Adresse (optional)",
        datum: "Rechnungsdatum",
        faelligkeit: "Fälligkeitsdatum (optional)",
        nettobetrag: "Nettobetrag",
        bruttobetrag: "Bruttobetrag",
        ust: "USt. in %",
      },
      abbrechen: "Abbrechen",
      speichern: "Rechnung speichern",
      speichere: "Speichere …",
      erfolg: {
        title: "Rechnung gespeichert",
        desc: "Rechnung {{nummer}} wurde erfasst und ist in der Liste sichtbar.",
        weitere: "Weitere Rechnung hochladen",
        zurListe: "Zur Liste",
      },
      // Field-level messages for the upload form, each naming the fix rather than the rule.
      validierung: {
        gesellschaft: "Bitte eine Gesellschaft wählen.",
        kunde: "Bitte einen Kunden wählen oder einen Namen eintragen.",
        rechnungsnummer: "Bitte die Rechnungsnummer eintragen.",
        datum: "Bitte das Rechnungsdatum wählen.",
        bruttoFehlt: "Bitte den Bruttobetrag eintragen.",
        bruttoPositiv: "Der Bruttobetrag muss größer als 0 sein.",
        zahl: "Bitte eine Zahl eintragen, z. B. 1.234,56.",
      },
      toast: {
        // Over 15 MB the file is still uploaded, only the AI extraction is skipped, so this is an
        // info and not an error.
        zuGrossFuerAnalyse:
          "Die Datei ist zu groß für die automatische Erkennung. Sie wird hochgeladen, die Felder müssen aber von Hand ausgefüllt werden.",
        typUngueltig: "Nur PDF, JPG oder PNG werden unterstützt.",
        zuGross: "Die Datei ist zu groß (max. 15 MB).",
        analyseFehlgeschlagen: "Analyse fehlgeschlagen: {{error}}",
        dateiFehlt: "Die Datei fehlt. Bitte noch einmal hochladen.",
        unvollstaendig: "Bitte die rot markierten Felder ausfüllen.",
        erstellt: "Rechnung gespeichert.",
        fehlgeschlagen: "Fehlgeschlagen: {{error}}",
      },
    },
  },

  // Manual booking (Briefing Screen 11): personnel costs, depreciation, taxes — items with no
  // receipt and no bank transaction, entered by hand so the evaluation stays complete.
  manuelleBuchungen: {
    title: "Manuelle Buchungen",
    subtitle:
      "Personalkosten, Abschreibungen und Steuern: Posten ohne Beleg und ohne Banktransaktion, die von Hand erfasst werden.",
    alleGesellschaften: "Alle Gesellschaften",
    hinweis:
      "Manuelle Buchungen fließen gleichberechtigt in die Auswertung ein: derselbe Gesamtbetrag wie bei den Belegen, nicht nur ein Anhängsel. Die gewählte BWA-Zeile/Kategorie entscheidet, wo die Buchung landet: nur „Materialaufwand / Wareneinsatz“ wirkt sich auf den Rohertrag aus, alles andere (Personal, Raumkosten, Kfz, Sonstige Kosten, …) erscheint erst weiter unten, im vorläufigen Ergebnis.",
    keinObjekt: "Kein Objekt",
    offenesEnde: "offenes Ende",
    suche: "Notiz, Kategorie, Objekt oder Gesellschaft suchen …",
    sort: {
      zeitraumAsc: "Zeitraum (aufsteigend)",
      zeitraumDesc: "Zeitraum (absteigend)",
      betragDesc: "Betrag (größte zuerst)",
      betragAsc: "Betrag (kleinste zuerst)",
      kategorie: "Kategorie (A–Z)",
    },
    // Das Jahr wird in ein Datum eingesetzt (`JJJJ-01-01`); eine ein- bis dreistellige Zahl lehnt
    // Postgres rundweg ab, was vorher als roher 22008-Fehler auf dem Bildschirm landete.
    jahrUngueltig:
      "Bitte ein Jahr zwischen {{von}} und {{bis}} eingeben. Angezeigt wird weiterhin {{jahr}}.",
    // Ein Ende vor dem Start ergibt null Monate — die Buchung wäre gespeichert, aber auf keinem
    // Bildschirm sichtbar und damit weder änderbar noch löschbar.
    endeVorStart: "Das Ende darf nicht vor dem Startmonat liegen.",
    bisJahrFehlt: "Bitte auch ein „Bis Jahr“ angeben oder „offenes Ende“ wählen.",
    betragHinweis:
      "Kosten positiv erfassen. Ein negativer Betrag wirkt als Korrektur und dreht die Zeile in der Auswertung um. 0,00 € ist nicht möglich.",
    wiederkehrend: "wiederkehrend",
    empty: "Keine manuellen Buchungen in diesem Zeitraum.",
    feld: {
      grund: "Grund (optional)",
      gesellschaft: "Gesellschaft",
      jahr: "Jahr",
      kategorie: "BWA-Linie / Kategorie",
      monat: "Monat",
      objekt: "Objekt (optional)",
      betrag: "Betrag (EUR)",
      notiz: "Notiz",
      wiederkehrend: "Monatlich wiederkehrend",
      wiederkehrendHint: "Wird jeden Monat automatisch berücksichtigt, ohne erneute Eingabe.",
      bisMonat: "Bis Monat",
      bisJahr: "Bis Jahr",
    },
    col: {
      gesellschaft: "Gesellschaft",
      zeitraum: "Zeitraum",
      kategorie: "BWA-Linie",
      objekt: "Objekt",
      notiz: "Notiz",
      betrag: "Betrag",
      aktionen: "Aktionen",
    },
    neu: {
      button: "Neue Buchung",
      title: "Neue manuelle Buchung",
      desc: "Gesellschaft, BWA-Linie, Zeitraum und Betrag: optional wiederkehrend.",
      speichern: "Speichern",
    },
    action: {
      bearbeiten: "Bearbeiten",
    },
    edit: {
      title: "Buchung bearbeiten",
      wiederkehrendHint:
        "Diese Buchung ist wiederkehrend: Änderungen gelten für alle künftigen Monate.",
      speichern: "Speichern",
    },
    loeschen: {
      // Vorher aus Zuordnungsregeln geliehen und las sich als „Regel löschen“.
      confirm: "Buchung löschen",
      title: "Buchung löschen?",
      desc: "Diese manuelle Buchung wird aus der Auswertung entfernt.",
      descWiederkehrend:
        "Diese wiederkehrende Buchung wird komplett entfernt, auch aus allen künftigen Monaten.",
    },
    toast: {
      gespeichert: "Gespeichert.",
      geloescht: "Gelöscht.",
      fehlgeschlagen: "Fehlgeschlagen: {{error}}",
    },
  },

  // Approval workflow admin (Briefing Screen 6): approvers + dynamic assignment-chain rules.
  freigabeRegeln: {
    leiter: {
      title: "Freigabe-Regeln",
      beliebig: "beliebig",
      tabs: {
        regeln: "Regeln",
        szenario: "Playground",
      },
      dimension: {
        gesellschaft: "Gesellschaft",
        lieferant: "Lieferant",
        objekt: "Objekt",
        bereich: "Geschäftsbereich",
      },
      test: {
        title: "Szenario testen",
        hint: "Eine Rechnung beschreiben und prüfen lassen, welche Regel sie freigibt.",
        betrag: "Bruttobetrag",
        pruefen: "Prüfen",
        zuruecksetzen: "Zurücksetzen",
        leer: "Noch nichts geprüft",
        leerHinweis:
          "So viel von der Rechnung eintragen wie bekannt ist und auf Prüfen klicken. Alles, was auf beliebig steht, gilt als nicht eingeschränkt, genau so, wie eine Regel ein Merkmal behandelt, das sie nicht festlegt.",
        trifftZu: "Diese Regel greift",
        verdraengtTitel: "Passen ebenfalls, werden aber verdrängt",
        weitere_one: "{{count}} weitere Regel passt ebenfalls, wird aber verdrängt.",
        weitere_other: "{{count}} weitere Regeln passen ebenfalls, werden aber verdrängt.",
        einzige: "Keine andere Regel passt.",
        keine: "Keine Regel trifft zu.",
        keineWarum: "Die Rechnung läuft über die Standard-Kette: {{chain}}.",
      },
      uebersicht: {
        aktiv_one: "{{count}} aktiv",
        aktiv_other: "{{count}} aktiv",
        probleme_one: "{{count}} Konfigurationsproblem",
        probleme_other: "{{count}} Konfigurationsprobleme",
        problemeTitel: "Konfigurationsprobleme",
        problemeHinweis:
          "Ein Problem liegt vor, wenn ein Schritt einer Regel eine Person nennt, die sich nicht mehr anmelden kann. Die Regel greift trotzdem, Belege bleiben an diesem Schritt liegen und niemand wird benachrichtigt.",
      },
      karte: {
        wenn: "Wenn",
        betrag: "Betrag",
        genehmiger: "Genehmigende",
        jederBetrag: "Jeder Betrag",
        abBetrag: "\u2265 {{amount}}",
        prioritaet: "Priorität",
        prioritaetVon: "{{position}} von {{total}}",
        aktionen: "Aktionen",
      },
      liste: {
        neueRegel: "Neue Regel",
        leer: "Noch keine Regeln angelegt.",
      },
      zeile: {
        bearbeiten: "Regel bearbeiten",
        aktiv: "Regel ist aktiv",
        inaktiv: "Regel ist ausgeschaltet",
        aktivKurz: "Aktiv",
        inaktivBadge: "Inaktiv",
        hinweisInaktiv: "Regel ist ausgeschaltet und wird bei der Freigabe übersprungen.",
        hinweisGestrandet:
          "Ein Schritt nennt eine Person, die sich nicht mehr anmelden kann, Belege bleiben hier liegen.",
        hinweisVerdraengt: "Passt auf den Test, wird aber von einer genaueren Regel verdrängt.",
        unbekannt: "Unbekannt",
        deaktiviert: "deaktiviert",
        autoSchritt: "Bereichsleitung (automatisch)",
      },
      editor: {
        abBetrag: "Ab Bruttobetrag",
        abBetragHinweis:
          "Diese Regel gilt für Belege ab diesem Betrag; 0 heißt für alle. Die Kette der Regel gilt immer ganz: für gestaffelte Freigaben zwei Regeln mit gleichem Geltungsbereich und verschiedenen Beträgen anlegen, die passende Regel mit dem höchsten Betrag gewinnt.",
        kette: "Freigabe-Kette",
        schritt: "Schritt {{n}}",
        keinWeiterer: "(kein weiterer Schritt)",
        genehmigerWaehlen: "Genehmigende Person wählen",
        merkmalNoetig:
          "Mindestens ein Merkmal muss festgelegt sein, sonst würde die Regel für jede Rechnung gelten.",
        ketteHinweis:
          "Der letzte Schritt ist die endgültige Freigabe und gibt die Zahlung frei. Dieselbe Person darf in einer Kette nicht zweimal vorkommen.",
        gleichePerson: "Jede Person darf in der Kette nur einmal vorkommen.",
        schrittBrauchtVorherigen: "Dieser Schritt setzt den vorherigen voraus.",
        schonVorhanden: "Für diese Kombination existiert bereits eine Regel.",
        speichern: "Speichern",
        speichert: "Speichert …",
        abbrechen: "Abbrechen",
        loeschen: "Regel löschen",
      },
      loeschen: {
        title: "Regel löschen?",
        desc: "Die Regel wird deaktiviert, bleibt aber für die Historie nachvollziehbar.",
        grund: "Grund für das Löschen",
        grundPlaceholder: "Grund",
        bestaetigen: "Löschen",
        abbrechen: "Abbrechen",
      },
      toast: {
        gespeichert: "Gespeichert.",
        geloescht: "Gelöscht.",
        aktiviert: "Regel aktiviert.",
        deaktiviert: "Regel ausgeschaltet.",
        fehlgeschlagen: "Fehlgeschlagen: {{error}}",
        unbekannterFehler: "Unbekannter Fehler",
      },
    },
    title: "Freigabe-Regeln",
    subtitle: "Wer prüft und freigibt, und ab welchem Betrag ein zweiter Schritt nötig ist.",
    beliebig: "beliebig",
    tab: {
      genehmiger: "Genehmiger",
      regeln: "Regeln",
    },
    col: {
      name: "Name",
      rolle: "Rolle",
      bereich: "Bereich",
      vertretung: "Vertretung",
      eskalation: "Eskalation",
      zahlung: "Zahlungsabwicklung",
      aktionen: "Aktionen",
      gesellschaft: "Gesellschaft",
      lieferant: "Lieferant",
      objekt: "Objekt",
      mindestbetrag: "Mindestbetrag",
      schritt1: "Schritt 1",
      schritt2: "Schritt 2",
    },
    // Area of responsibility (migration 0087; client: "each department head approves their own
    // area"). One combined field in the UI, split into approvers.area/covers_all_areas at save.
    bereich: {
      keiner: "Kein Bereich",
      hospitality: "Hospitality",
      stay_re: "Stäy RE und Projekte",
      alle: "Alle Bereiche",
    },
    leerGenehmiger: "Noch keine Genehmiger angelegt.",
    leerRegeln: "Noch keine Regeln angelegt: jede Gesellschaft hat eine Standardkette.",
    regelnHinweis:
      "Die spezifischste passende Regel gewinnt. Ohne passende Regel gilt die Standardkette der Gesellschaft.",
    aktivTitle: "Aktiv/Inaktiv",
    inaktivBadge: "Inaktiv",
    keineVertretung: "Keine Vertretung",
    tageAnzahl_one: "{{count}} Tag",
    tageAnzahl_other: "{{count}} Tage",
    paymentHandler: {
      keine: "Nicht festgelegt",
      boss: "Vorgesetzter überweist selbst",
      account_holder: "Person mit Kontovollmacht",
    },
    feld: {
      mitarbeiter: "Mitarbeiter",
      mitarbeiterWaehlen: "Mitarbeiter wählen",
      mitarbeiterLeer: "Noch keine Mitarbeiter angelegt: zuerst unter Team & Rollen anlegen.",
      mitarbeiterAlleVergeben: "Alle Mitarbeiter sind bereits als Genehmiger angelegt.",
      mitarbeiterHint:
        "Nur Mitarbeiter, die unter Team & Rollen angelegt sind, stehen zur Auswahl.",
      mitarbeiterFixiert:
        "Wer dieser Genehmiger ist, kann nachträglich nicht geändert werden, nur Vertretung, Eskalation und Zahlungsabwicklung.",
      bereich: "Zuständigkeitsbereich",
      bereichHint:
        "Bestimmt, für welche Gesellschaften diese Person automatisch als Schritt 2 vorgeschlagen wird.",
      bereichNurManager: "Nur für Genehmiger mit der Rolle „Vorgesetzter“ verfügbar.",
      vertretung: "Vertretung (bei Abwesenheit)",
      eskalation: "Eskalation nach (Tagen)",
      eskalationPlaceholder: "z. B. 5",
      eskalationUngueltig: "Bitte eine positive Anzahl Tage eingeben.",
      zahlung: "Zahlungsabwicklung",
      mindestbetrag: "Mindestbetrag (EUR)",
      mindestbetragHint:
        "Diese Regel gilt für Belege ab diesem Betrag; 0 heißt für alle. Die Kette der Regel gilt immer ganz: für gestaffelte Freigaben zwei Regeln mit gleichem Geltungsbereich und verschiedenen Beträgen anlegen (die passende Regel mit dem höchsten Betrag gewinnt).",
      schritt1: "Schritt 1 (Prüfung)",
      schritt2: "Schritt 2 (Endgültige Freigabe)",
      schritt2Auto: "Automatisch nach Zuständigkeitsbereich",
      schritt2Ohne: "Einstufige Kette",
      schritt2Hint:
        "„Automatisch“ (empfohlen) gibt an den Genehmiger mit dem passenden Zuständigkeitsbereich der Gesellschaft weiter. Eine feste Person überschreibt das. „Einstufige Kette“ überspringt Schritt 2 vollständig.",
      schritt2GleichWieSchritt1: "Schritt 2 darf nicht dieselbe Person wie Schritt 1 sein.",
      schritt2AutoKoennteKollidieren:
        "Achtung: Schritt 1 ist selbst einem Zuständigkeitsbereich zugeordnet: „Automatisch“ könnte auf dieselbe Person auflösen.",
      schrittWaehlen: "Genehmiger wählen",
      optionInaktiv: "deaktiviert",
      genehmigerInaktiv:
        "{{name}} ist deaktiviert und kann nicht freigeben. Bitte unter „Team & Rollen“ reaktivieren oder eine andere Person wählen.",
      schritt2OhneRecht:
        "{{name}} hat nicht das Recht „Endgültig freigeben“. Die Rechnung würde diesen Schritt erreichen, ohne dass jemand sie freigeben kann.",
    },
    unbekannt: "Unbekannte Person",
    scope: {
      gesellschaft: "Gesellschaft",
      lieferant: "Lieferant",
      objekt: "Objekt",
    },
    neuerGenehmiger: {
      button: "Neuer Genehmiger",
      title: "Neuer Genehmiger",
    },
    genehmigerBearbeiten: {
      title: "Genehmiger bearbeiten",
    },
    neueRegel: {
      button: "Neue Regel",
      title: "Neue Regel",
      desc: "Gilt für die ausgewählte Kombination: mindestens ein Feld muss gesetzt sein.",
      schonVorhanden: "Für diese Kombination existiert bereits eine Regel.",
    },
    regelBearbeiten: {
      title: "Regel bearbeiten",
    },
    loeschen: {
      title: "Regel löschen?",
      desc: "Die Regel wird deaktiviert, bleibt aber für die Historie nachvollziehbar.",
      grundPlaceholder: "Grund (optional)",
    },
    genehmigerLoeschen: {
      title: "Genehmiger löschen?",
      desc: "{{name}} wird in den Papierkorb verschoben und steht nicht mehr zur Auswahl. Bestehende Regeln, die diesen Namen nennen, bleiben unverändert.",
      nochInRegeln:
        "Achtung: {{count}} Freigabe-Regel(n) nennen diese Person weiterhin. Belege, die an diesem Schritt stehen, lassen sich danach von niemandem mehr weiterbewegen, bis die Regel geändert oder der Genehmiger wiederhergestellt wird.",
    },
    action: {
      abbrechen: "Abbrechen",
      speichern: "Speichern",
      loeschen: "Löschen",
    },
    sucheGenehmiger: "Genehmiger oder Vertretung suchen …",
    sucheRegeln: "Nach Gesellschaft, Lieferant, Objekt oder Person suchen …",
    toast: {
      aktiviert: "Genehmiger aktiviert.",
      deaktiviert: "Genehmiger deaktiviert.",
      gespeichert: "Gespeichert.",
      geloescht: "Gelöscht.",
      fehlgeschlagen: "Fehlgeschlagen: {{error}}",
      bereichKonflikt:
        "Für „{{bereich}}“ gibt es bereits einen aktiven Genehmiger. Bitte diesen zuerst deaktivieren oder umverteilen.",
    },
  },

  // DATEV handover (Briefing Screen 9).
  datevUebergabe: {
    title: "DATEV-Übergabe",
    leerGesellschaften: "Keine Gesellschaften vorhanden.",
    leerFilter: "Keine Gesellschaft passt zu dieser Suche.",
    suche: "Gesellschaft suchen …",
    nie: "Noch nie",
    letzterVersuchFehler: "Letzter Versuch fehlgeschlagen",
    dateien: "{{count}} Dateien",
    uebersprungenKurz: "{{count}} wird übersprungen",
    richtungInaktiv: "noch nicht aktiv",
    summary: {
      gesellschaften: "{{count}} Gesellschaften",
      bereit: "{{count}} Datei(en) bereit",
      gesendet: "{{count}} bereits gesendet",
      offen: "{{count}} ohne Einrichtung",
    },
    bounce: {
      title: "{{count}} DATEV-Übergabe wurde nicht zugestellt",
      body: "Die E-Mail wurde angenommen, kam aber als unzustellbar zurück. Der Steuerberater hat sie nie erhalten. Die Belege stehen wieder auf der Liste. Bitte die Adresse prüfen, bevor erneut gesendet wird.",
      belege: "{{count}} Belege",
      erledigt: "Als erledigt markieren",
      toast: {
        ok: "Als erledigt markiert.",
        fehlgeschlagen: "Fehlgeschlagen: {{error}}",
      },
    },
    export: {
      title: "Monatsexport",
      desc: "Alle Belege eines Monats als ZIP-Archiv herunterladen.",
      gesellschaft: "Gesellschaft",
      gesellschaftWaehlen: "Gesellschaft wählen",
      monat: "Monat",
      jahr: "Jahr",
      hinweis:
        "Das Archiv enthält alle Belege mit Belegdatum in diesem Monat, unabhängig vom Status, dazu eine Übersicht als CSV. Es wird nichts als an DATEV übergeben markiert.",
      starten: "Archiv herunterladen",
      laeuft: "Wird erstellt …",
      fertig: "{{count}} Belege heruntergeladen.",
      ergebnis: "{{included}} von {{total}} Belegen im Archiv.",
      weitere: "und {{count}} weitere",
      monatName: {
        "1": "Januar",
        "2": "Februar",
        "3": "März",
        "4": "April",
        "5": "Mai",
        "6": "Juni",
        "7": "Juli",
        "8": "August",
        "9": "September",
        "10": "Oktober",
        "11": "November",
        "12": "Dezember",
      },
    },
    spalte: {
      gesellschaft: "Gesellschaft",
      einrichtung: "DATEV-Einrichtung",
      bereit: "Bereit zum Senden",
      gesendet: "Gesendet",
      zuletzt: "Zuletzt gesendet",
      aktionen: "Aktionen",
    },
    status: {
      eingerichtet: "Eingerichtet",
      nichtEingerichtet: "Nicht eingerichtet",
      pausiert: "Pausiert",
    },
    filter: {
      alle: "Alle",
      eingerichtet: "Eingerichtet",
      offen: "Nicht eingerichtet",
      bereit: "Bereit zum Senden",
      gesendet: "Bereits gesendet",
    },
    aktion: {
      anDatevSenden: "An DATEV senden",
      monatsexport: "Monatsexport",
      sammelversand: "Sammelversand",
      senden: "Senden",
      einrichten: "Einrichten",
      einrichtungBearbeiten: "DATEV-Einrichtung bearbeiten",
      verlaufAnzeigen: "Verlauf anzeigen",
      abbrechen: "Abbrechen",
      schliessen: "Schließen",
    },
    setup: {
      adresseFuer: {
        incoming: "Adresse für Eingangsrechnungen",
        outgoing: "Adresse für Ausgangsrechnungen",
        other: "Adresse für sonstige Belege",
      },
      title: "DATEV-Einrichtung",
      titleEdit: "DATEV-Einrichtung bearbeiten",
      desc: "Legt fest, wohin die Belege dieser Gesellschaft gesendet werden.",
      gesellschaft: "Gesellschaft",
      adresse: "DATEV-Upload-Adresse",
      adresseHilfe: "An diese Adresse werden die Belege dieser Gesellschaft gesendet.",
      adresseVorhanden: "Gespeichert. Zum Ändern neue Adresse eingeben.",
      aktivKurz: "Aktiv",
      speichern: "Änderungen speichern",
      gespeichert: "DATEV-Einrichtung gespeichert.",
      fehlgeschlagen: "Speichern fehlgeschlagen: {{error}}",
    },
    senden: {
      title: "Dateien an DATEV senden",
      desc: "Diese Dateien sind bereit für DATEV.",
      descEine: "{{count}} Dateien von {{company}} sind bereit für DATEV.",
      summe: "{{count}} Dateien bereit zum Senden",
      auswahl: "{{count}} von {{total}} Dateien ausgewählt",
      alleWaehlen: "Alle auswählen",
      uebersprungen:
        "{{count}} Dateien werden übersprungen: Die hinterlegte Datei ist für DATEV nicht geeignet.",
      leer: "Zurzeit ist keine Datei bereit.",
      laeuft: "Wird gesendet …",
      laeuftCompany: "{{company}} wird gesendet …",
      resultTitle: "An DATEV gesendet",
      resultDesc: "Ergebnis je Gesellschaft.",
      result: {
        gesendet: "{{count}} Dateien gesendet",
        fehlgeschlagen: "Fehlgeschlagen",
        mails: "{{count}} E-Mails · {{size}}",
        uebersprungen: "{{count}} Dateien übersprungen",
      },
    },
    blockGrund: {
      "no-file": "Keine Datei hinterlegt",
      unsupported: "Dateityp ungeeignet",
      "too-large": "Datei zu groß",
    },
    verlauf: {
      title: "Übergabe-Verlauf",
      gesendetTitel: "Gesendet",
      uebersprungenTitel: "{{count}} Belege wurden übersprungen",
      uebersprungenHilfe:
        "Diese Belege wurden bei der letzten Übergabe nicht mitgesendet und bleiben offen, bis die Datei in Ordnung ist.",
      leer: "Für diese Gesellschaft wurde noch nichts an DATEV gesendet.",
      zeile: "{{count}} Dateien · {{size}}",
      status: { success: "Abgeschlossen", error: "Fehlgeschlagen", bounced: "Nicht zugestellt" },
      von: "durch {{who}}",
    },
    richtung: {
      incoming: "Eingangsrechnungen",
      outgoing: "Ausgangsrechnungen",
      other: "Sonstiges",
    },
  },

  // Reports (Auswertungen).
  auswertungen: {
    ustUngeklaert: {
      karte_one:
        "{{count}} Beleg über {{amount}} braucht noch die Angabe, ob die Vorsteuer abziehbar ist.",
      karte_other:
        "{{count}} Belege über {{amount}} brauchen noch die Angabe, ob die Vorsteuer abziehbar ist.",
      titel: "Vorsteuer noch ungeklärt",
      hinweis:
        "Solange offen ist, ob die Vorsteuer erstattet wird, ist auch offen, mit welchem Betrag diese Belege in die Kosten eingehen. Die Angabe wird im Beleg selbst gesetzt. Dafür einen Beleg unten öffnen.",
    },
    aufschluesselung: {
      untertitel: "Kategorien und die Belege dahinter ansehen.",
      betriebskosten: "Betriebskosten",
      material: "Material und Waren",
      spalteKategorie: "Kategorie",
      spalteAnteil: "Anteil",
      spalteAnzahl: "Belege",
      spalteBeleg: "Lieferant / Beschreibung",
      spalteDatum: "Datum",
      spalteBetrag: "Betrag",
      summe: "Summe {{gruppe}}",
      schliessen: "Schließen",
      gesamtbetrag: "Gesamtbetrag",
      anzahl_one: "{{count}} Beleg",
      anzahl_other: "{{count}} Belege",
      platzhalter: "Eine Kategorie links auswählen, um die einzelnen Belege zu sehen.",
      keineEintraege: "Zu dieser Kategorie gibt es im gewählten Zeitraum keine Belege.",
      gesamtkosten: "Gesamtkosten (beide Gruppen)",
      direktAufKategorie: "Ohne Unterkategorie",
      materialUntertitel: "nach Unterkategorie",
    },
    infoLabel: "Über diese Auswertung",
    title: "Kostenanalyse",
    subtitle: "Umsatz, Kosten und Betriebsergebnis für den gewählten Zeitraum.",
    // Also used by manuelle-buchungen/index.tsx for its own month-picker — not specific to this page.
    monate: ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"],
    disclosure:
      "Diese Zahlen beruhen auf abgeglichenen Belegen und manuell erfassten Kosten. Sie sind keine geprüfte BWA.",
    accessNotice: "Diese Auswertung ist für die Geschäftsführung gedacht.",
    filter: {
      // Über jedem Filter, damit ein gesetzter Filter noch sagt, welche Dimension er einschränkt.
      // "IMKO · Immo Kontor" allein verrät nicht mehr, dass es der Gesellschaftsfilter ist.
      labelGesellschaft: "Gesellschaft",
      button: "Filter",
      title: "Filter",
      labelObjekt: "Objekt",
      labelKategorie: "Kategorie",
      labelKonto: "Konto",
      labelZeitraum: "Zeitraum",
      zeitraumBereich: "{{von}} bis {{bis}}",
      zeitraumOhneGrenze: "Gesamter erfasster Zeitraum",
      imkoImgm: "IMKO + IMGM",
      alleGesellschaften: "Alle Gesellschaften",
      alleObjekte: "Alle Objekte",
      alleKategorien: "Alle Kategorien",
      alleKonten: "Alle Konten",
      allePerioden: "Alle Perioden",
      vormonat: "Vormonat",
      vorjahr: "Vorjahr",
      // Vormonat/Vorjahr sind relativ. Steht in der Liste schon derselbe konkrete Zeitraum, wird
      // dieser mit dem Zusatz beschriftet, statt zweimal derselbe Wert angeboten zu werden.
      vormonatZusatz: "{{label}} (Vormonat)",
      vorjahrZusatz: "{{label}} (Vorjahr)",
      zuruecksetzen: "Filter zurücksetzen",
    },
    summe: {
      umsatz: "Umsatz",
      gesamtkosten: "Gesamtkosten",
      betriebsergebnis: "Betriebsergebnis",
      marge: "Marge",
      vomUmsatz: "vom Umsatz",
      // Die drei Zahlen gehen exakt auf: Umsatz minus Gesamtkosten ergibt das Betriebsergebnis.
      erklaerungUmsatz:
        "Alle Erlöse des Zeitraums, netto. Es zählen nur Ausgangsrechnungen, die als bezahlt abgeglichen sind.",
      erklaerungGesamtkosten:
        "Alle Kosten des Zeitraums zusammen: Material und Waren plus sämtliche Betriebskosten.",
      erklaerungBetriebsergebnis:
        "Umsatz minus Gesamtkosten. Was das laufende Geschäft im gewählten Zeitraum übrig lässt.",
      vergleichGegen: "ggü. {{label}}",
      vergleichUnveraendert: "unverändert ggü. {{label}}",
      margeErklaerung:
        "Von {{umsatz}} Umsatz bleiben hier {{wert}} übrig. Das entspricht {{prozent}} % des Umsatzes.",
      kostenanteilErklaerung:
        "Von {{umsatz}} Umsatz gehen {{wert}} für Kosten weg. Das entspricht {{prozent}} % des Umsatzes.",
      margenHinweisTitel: "Warum keine Marge angezeigt wird:",
      margenHinweisText:
        "Margen sind ein Anteil am Umsatz. Da im gewählten Zeitraum kein Umsatz erfasst ist, lässt sich keine Marge berechnen.",
    },
    // Net is the standard: VAT is a pass-through item and belongs in no evaluation line.
    // Gross is offered because a company that cannot reclaim input tax bears the gross amount.
    basis: {
      label: "Netto oder brutto",
      net: "Netto",
      gross: "Brutto",
      gruppe: "Beträge",
      erklaerungTitel: "Wie die Beträge gezählt werden",
      erklaerungNetto:
        "Beträge ohne Umsatzsteuer. Bei Kosten wird die Vorsteuer mitgezählt, die nicht erstattet wird. Standard, weil die Umsatzsteuer nur durchläuft und kein Ertrag und kein Aufwand ist.",
      erklaerungBrutto:
        "Beträge genau so, wie sie auf der Rechnung stehen, inklusive Umsatzsteuer. Sinnvoll, wenn die Vorsteuer nicht erstattet wird und der volle Betrag wirklich getragen wird.",
    },
    kpi: {
      // Die Kacheln heißen im Klartext, die BWA-Bezeichnung steht in der Erklärung dahinter und in
      // der Tabelle darunter. Vorher trugen sie die DATEV-Namen und davor sogar "Gewinn
      // (Rohertrag)" — eine Kachel, die -135,00 € zeigte, während unterm Strich -13.605,41 €
      // standen. Wer die BWA kennt, findet den Begriff weiterhin; wer sie nicht kennt, muss ihn
      // nicht mehr kennen.
      rohertrag: "Einnahmen minus Material",
      rohertragErklaerung:
        "Was von den Einnahmen übrig bleibt, wenn nur Material und Wareneinsatz abgezogen sind. Alle übrigen Kosten wie Personal, Raum oder Reparaturen stecken hier noch drin. In der Tabelle unten heißt diese Zeile „Rohertrag“.",
      betriebsergebnis: "Ergebnis aus dem Betrieb",
      betriebsergebnisErklaerung:
        "Was das laufende Geschäft übrig lässt, nachdem alle Betriebskosten abgezogen sind: Personal, Raum, Versicherungen, Reparaturen und so weiter. Zinsen und Steuern fehlen noch. In der Tabelle unten heißt diese Zeile „Betriebsergebnis“.",
      vorlaeufigesErgebnis: "Unterm Strich",
      vorlaeufigesErgebnisErklaerung:
        "Das Ergebnis nach allen Kosten, Zinsen und Steuern. Vorläufig, weil nur vollständig abgeglichene Belege zählen. In der Tabelle unten heißt diese Zeile „Vorläufiges Ergebnis“.",
      ust: "Umsatzsteuer",
      // Regel 1 des Briefings: die USt ist ein durchlaufender Posten und gehört in keine
      // Auswertungszeile. Sie wird daneben ausgewiesen, nicht eingerechnet.
      ustErklaerung:
        "Die Umsatzsteuer auf den Belegen dieses Zeitraums. Sie ist weder Gewinn noch Kosten, sie läuft nur durch: Sie ziehen sie als Vorsteuer ab oder führen sie ab. Deshalb steht sie neben dem Ergebnis und nicht darin.",
      offenePostenErklaerung:
        "Rechnungen, die noch offen sind, eingehende wie ausgehende. Sie zählen noch nicht ins Ergebnis, weil sie noch nicht bezahlt oder noch nicht mit dem Kontoauszug abgeglichen sind. Zum Öffnen der Liste anklicken.",
      nichtZugeordnetErklaerung:
        "Abgeglichene Belege, denen noch niemand eine Kategorie gegeben hat. Sie gehören in keine Zeile der Auswertung und fehlen deshalb in jedem Ergebnis oben. Aufklappen können Sie sie unten in der Tabelle.",
      nichtGuvErklaerung:
        "Beträge, die bewusst aus der Ergebnisrechnung herausgehalten werden, etwa Durchlaufposten oder Privatentnahmen.",
      // Mit Betrag: die Kopfzahl der Kachel muss sich erklären. "939,01 €" über
      // "0,00 € abzugsfähig · 0,00 € nicht abzugsfähig" liest sich wie eine berechnete Aufteilung,
      // gemeint ist aber "für diesen Betrag ist die Abzugsfähigkeit noch ungeklärt".
      nichtZugeordnet: "Ohne Kategorie",
      // Aufklapp-Bucket der Umsatzlinie (Migration 0045) — Ausgangsrechnungen haben keine
      // Feinkategorie, das ist also NICHT dasselbe wie "nicht zugeordnet" bei Kosten.
      ausgangsrechnungen: "Ausgangsrechnungen",
      nichtGuv: "Zählt nicht ins Ergebnis",
      offenePosten: "Unbezahlte Rechnungen",
      // Rohertrag & Co. rechnen Umsatz gegen Kosten. Fällt der Umsatz durch einen Filter weg, ist
      // die Zahl nur noch die Kostenseite und trägt trotzdem den Namen "Rohertrag".
      ohneUmsatzHinweis: "Ohne Umsatzerlöse, nur Kostenseite",
      ustAufteilung:
        "Davon bekommen Sie {{deductible}} als Vorsteuer vom Finanzamt zurück. {{nondeductible}} tragen Sie selbst, weil dafür kein Vorsteuerabzug möglich ist.",
      ustHinweisLang:
        "Umsatzsteuer ist weder Einnahme noch Kosten: Sie ziehen sie für das Finanzamt ein und geben sie weiter. Deshalb steckt sie in keiner Zahl oben drin.",
    },
    chart: {
      // Die Tabelle nennt die Zahlen, sie sagt aber nicht, dass eine Zeile 98 % von allem ist.
      titel: "Kostenverteilung",
      verlaufTitel: "Umsatz vs. Kosten",
      rest: "Übrige Kategorien",
      kosten: "Kosten",
      verlaufUntertitel: "Zeigt, ob der Umsatz die Kosten im jeweiligen Zeitraum gedeckt hat.",
      gewinn: "Gewinn",
      verlust: "Verlust",
      gewinnFlaeche: "Grüne Fläche = Gewinn (Umsatz über Kosten)",
      verlustFlaeche: "Rote Fläche = Verlust (Kosten über Umsatz)",
    },
    spalte: {
      // "BWA-Linie" war Fachsprache in der Spaltenüberschrift. Die Zeilennamen selbst bleiben
      // DATEV-Wortlaut, die Überschrift muss es nicht sein.
      linie: "Position",
      betrag: "Betrag",
      vorperiode: "Vorperiode ({{label}})",
      differenz: "Differenz",
    },
    ohneKategorie: {
      // Der Betrag steht NICHT in den Gesamtkosten oben. Der Text muss das sagen, ohne zu
      // suggerieren, dass er dort schon enthalten wäre.
      titel: "Braucht Kategorie",
      // Diese Belege laufen in KEINE Zeile der Auswertung ein. Der Hinweis muss sagen, dass die
      // Zahlen oben deshalb unvollständig sind, und nicht nur, dass es die Belege gibt.
      warnung_one: "{{amount}} aus {{count}} Beleg ohne Kategorie fehlen in allen Zahlen oben.",
      warnung_other: "{{amount}} aus {{count}} Belegen ohne Kategorie fehlen in allen Zahlen oben.",
      hinweis_one:
        "Diesem Beleg fehlt eine Kategorie, deshalb zählt er in keiner Zeile oben mit. Zum Öffnen anklicken und dort eine Kategorie setzen.",
      hinweis_other:
        "Diesen {{count}} Belegen fehlt eine Kategorie, deshalb zählen sie in keiner Zeile oben mit. Zum Öffnen anklicken und dort eine Kategorie setzen.",
    },
    belegListe: {
      weitere: "{{count}} weitere werden geladen …",
    },
    glossar: {
      oeffnen: "Was bedeuten diese Zeilen?",
      titel: "Die Zeilen der Auswertung",
      untertitel: "Die Bezeichnungen stammen aus der DATEV-BWA. Hier stehen sie im Klartext.",
    },
    tabelle: {
      titel: "Aufschlüsselung",
      untertitel: "So entsteht das Ergebnis. Einzelne Kostenkategorien lassen sich aufklappen.",
      nurMitBetrag: "Nur Kategorien mit Beträgen",
      alleZeilen: "Alle Kategorien anzeigen",
      ausgeblendet_one: "{{count}} Zeile ohne Betrag ausgeblendet",
      ausgeblendet_other: "{{count}} Zeilen ohne Betrag ausgeblendet",
      nichtImErgebnis: "Nicht im Ergebnis enthalten",
    },
    export: {
      csv: "CSV exportieren",
      // Zeilenbeschriftungen im Kopf der CSV-Datei: die Datei muss festhalten, WONACH gefiltert
      // wurde, sonst ist ein gespeicherter Export eine Woche später nicht mehr zuzuordnen.
      filterGesellschaft: "Gesellschaft",
      filterObjekt: "Objekt",
      filterKategorie: "Kategorie",
      filterKonto: "Konto",
      filterZeitraum: "Zeitraum",
    },
    manuelleBuchung: "Manuelle Buchung",
    nichtEingeteilt:
      "{{count}} Beleg(e) ohne gültiges Buchungsdatum im aktuellen Zeitraum ausgeschlossen.",
    kontoAusschluss:
      "{{count}} manuelle Buchung(en) haben kein Konto und sind beim aktiven Konto-Filter ausgeschlossen.",
    // LexOffice liefert beim Sync nicht immer eine Steueraufschlüsselung — dann zählt die
    // Ausgangsrechnung mit ihrem Bruttobetrag statt Netto, damit der Umsatz nie einfach auf 0 fällt.
    ausgangNettoUngeklaert:
      "{{count}} Ausgangsrechnung(en) ohne bekannten Nettobetrag, mit Bruttobetrag verbucht.",
    // Kostenseitiges Gegenstück. Vorher trug ein abgeglichener Beleg ohne Nettobetrag stillschweigend
    // 0,00 € zur Auswertung bei — er zählte als "im Umfang" und buchte dann nichts.
    kostenNettoUngeklaert:
      "{{count}} abgeglichene(r) Beleg(e) ohne bekannten Nettobetrag, mit Bruttobetrag verbucht.",
    // Ausgangsrechnungen tragen weder Objekt noch abgeglichenes Konto. Beide Filter entfernen den
    // Umsatz daher vollständig — das muss über den Kacheln stehen, nicht nur in einer grauen Zeile.
    umsatzDurchFilterAusgeblendet:
      "Objekt- bzw. Konto-Filter aktiv: {{count}} Ausgangsrechnung(en) und damit sämtliche Umsatzerlöse sind ausgeschlossen. Rohertrag und Ergebnis zeigen nur die Kostenseite.",
    zeile: {
      revenue: "Umsatzerlöse",
      change_in_inventory: "Bestandsveränderung",
      capitalized_own_work: "Aktivierte Eigenleistungen",
      total_output: "Gesamtleistung",
      cogs_material: "Material und Waren",
      gross_profit: "Rohertrag",
      other_op_income: "Sonstige betriebliche Erträge",
      operating_gross_profit: "Betrieblicher Rohertrag",
      personnel: "Personalkosten",
      occupancy: "Raum- und Objektkosten",
      business_tax: "Betriebliche Steuern",
      insurance: "Versicherungen / Beiträge",
      vehicle: "Kfz-Kosten (ohne Steuer)",
      advertising_travel: "Werbe- / Reisekosten",
      cogs_sold: "Kosten der bezogenen Leistungen",
      depreciation: "Abschreibungen",
      repair_maintenance: "Reparatur / Instandhaltung",
      other_costs: "Sonstige Betriebskosten",
      operating_result: "Betriebsergebnis",
      interest_expense: "Zinsaufwand",
      other_neutral_expense: "Sonstiger neutraler Aufwand",
      interest_income: "Zinserträge",
      other_neutral_income: "Sonstige neutrale Erträge",
      result_before_taxes: "Ergebnis vor Steuern",
      tax_income_earnings: "Steuern vom Einkommen und Ertrag",
      preliminary_result: "Vorläufiges Ergebnis",
      unassigned: "Ohne Kategorie",
      not_pnl: "Zählt nicht ins Ergebnis",
      // Gruppenüberschriften der neuen Lesereihenfolge. Die DATEV-Zeilen darunter behalten ihre
      // Bezeichnung, nur die Kostenzeilen heißen jetzt so, wie ein Mensch sie nennen würde.
      group_revenue: "Umsatzerlöse",
      group_direct_costs: "Direkte Kosten",
      group_operating_costs: "Betriebskosten",
      group_below_result: "Zinsen, neutrale Posten und Steuern",
    },
    // Ein Satz Klartext je BWA-Zeile, als Tooltip auf dem Zeilennamen. Die DATEV-Bezeichnungen
    // bleiben unverändert, weil der Kunde zeilenweise gegen seine echte BWA vergleicht — die
    // Erklärung kommt daneben, nicht an ihre Stelle.
    // Eine Zeile Klartext unter den beiden Ergebniszeilen. Der DATEV-Name bleibt stehen, das hier
    // ist das, was ihn ohne Buchhaltungskenntnisse lesbar macht.
    zeileKurz: {
      gross_profit: "Umsatz minus Material und Waren",
      operating_result: "Nach allen laufenden Kosten",
      preliminary_result: "Nach Zinsen und Steuern",
    },
    zeileHinweis: {
      revenue: "Was Sie Ihren Kunden in Rechnung gestellt haben, netto und bereits bezahlt.",
      change_in_inventory:
        "Veränderung der eigenen Bestände. In diesem Betrieb üblicherweise null.",
      capitalized_own_work:
        "Eigene Arbeit, die als Anlagevermögen aktiviert wurde. Üblicherweise null.",
      total_output: "Umsatzerlöse plus die beiden Zeilen darüber.",
      cogs_material: "Material und Ware, die direkt in die erbrachte Leistung geflossen sind.",
      gross_profit: "Gesamtleistung minus Materialaufwand. Alle übrigen Kosten stehen darunter.",
      other_op_income: "Erträge aus dem Betrieb, die kein Umsatz sind, etwa Erstattungen.",
      operating_gross_profit: "Rohertrag plus sonstige betriebliche Erträge.",
      personnel: "Löhne, Gehälter und Sozialabgaben.",
      occupancy: "Miete, Pacht, Energie und Nebenkosten der genutzten Räume.",
      business_tax: "Steuern, die der Betrieb selbst trägt, ohne Einkommen- und Ertragsteuer.",
      insurance: "Versicherungen, Beiträge und Abgaben.",
      vehicle: "Fahrzeugkosten ohne die darauf entfallende Kfz-Steuer.",
      advertising_travel: "Werbung, Repräsentation und Reisekosten.",
      cogs_sold: "Fremdleistungen, die Sie eingekauft und weitergegeben haben.",
      depreciation: "Wertverlust von Anlagevermögen über die Nutzungsdauer.",
      repair_maintenance: "Instandhaltung und Reparaturen an Gebäuden und Anlagen.",
      other_costs: "Betriebskosten, die in keine der Zeilen darüber passen.",
      operating_result: "Was vom laufenden Betrieb übrig bleibt, vor Zinsen und Steuern.",
      interest_expense: "Zinsen, die Sie für Darlehen und Kredite gezahlt haben.",
      other_neutral_expense: "Aufwand außerhalb des laufenden Betriebs.",
      interest_income: "Zinsen, die Sie erhalten haben.",
      other_neutral_income: "Erträge außerhalb des laufenden Betriebs.",
      result_before_taxes: "Betriebsergebnis plus Zinsen und neutrale Posten.",
      tax_income_earnings: "Körperschaft- und Gewerbesteuer auf das Ergebnis.",
      preliminary_result:
        "Das Ergebnis dieser Auswertung. Vorläufig, weil nur abgeglichene Belege zählen.",
      unassigned:
        "Abgeglichene Belege, denen noch keine Kategorie zugewiesen ist. Sie fehlen in jeder Ergebniszeile.",
      not_pnl:
        "Bewusst aus der Ergebnisrechnung ausgenommen, etwa Durchlaufposten oder Privatentnahmen.",
    },
  },

  // Shared by every form that writes a bank_accounts row.
  bankAccountForm: {
    field: {
      name: "Kontobezeichnung",
      gesellschaft: "Gesellschaft",
      gesellschaftKeine: "Keine Gesellschaft",
      gesellschaftWarnung:
        "Ohne Gesellschaft sind die Umsätze dieses Kontos für alle angemeldeten Benutzer sichtbar und fehlen in gesellschaftsbezogenen Auswertungen.",
      iban: "IBAN",
      bic: "BIC",
      bank: "Kreditinstitut",
      holder: "Kontoinhaber",
      art: "Art",
      artPlaceholder: "Art auswählen …",
      waehrung: "Währung",
    },
    invalid: {
      nameMissing: "Bitte eine Kontobezeichnung angeben.",
      nameTooLong: "Die Kontobezeichnung ist zu lang.",
      companyMissing: "Bitte eine Gesellschaft auswählen.",
      holderMissing: "Bitte angeben, auf wen das Konto läuft.",
      productTypeMissing: "Bitte die Art des Kontos auswählen.",
      currencyMissing: "Bitte eine Währung angeben.",
      ibanMissing: "Bitte die IBAN des Kontos angeben. Nur Karten haben keine.",
      ibanInvalid: "Das ist keine vollständige IBAN.",
      bicInvalid: "Ein BIC hat 8 oder 11 Zeichen, zum Beispiel MALADE51DKH.",
      currencyInvalid: "Bitte einen Währungscode aus drei Buchstaben angeben, zum Beispiel EUR.",
      holderTooLong: "Der Name des Kontoinhabers ist zu lang.",
      bankNameTooLong: "Der Name des Kreditinstituts ist zu lang.",
      productTypeTooLong: "Die Angabe zur Art ist zu lang.",
    },
  },

  // Bank connections (Bankverbindungen).
  bankkonten: {
    // The "Manuell angelegt" tab with nothing in it. Not a fault: most Hubs get every account
    // through a bank connection, and this tab exists so one can be added without one.
    emptyManuell: {
      title: "Keine Konten ohne Bankverbindung",
    },
    title: "Bankkonten",
    // The two subjects on this screen. "Bankkonten" and not "BANKSapi": the provider is an
    // implementation detail of how the rows arrive, the tab names what the reader is looking at.
    tab: {
      konten: "BANKSapi",
      // Not "Manuell angelegt": some of these were seeded with their IBAN so a future connection
      // adopts them rather than inserting a duplicate, and nobody typed those in. What they have in
      // common is that no connection delivers them.
      manuell: "Manuell angelegt",
      pleo: "Pleo",
    },
    verbindungen_one: "{{count}} Bankverbindung",
    verbindungen_other: "{{count}} Bankverbindungen",
    // Group headers of the accounts table. Each connection is one group; the two buckets below it
    // are the accounts that belong to no readable connection.
    gruppe: {
      konten_one: "{{count}} Konto",
      konten_other: "{{count}} Konten",
      andere: "Weitere Konten",
      unbekannteBank: "Unbenannte Bankverbindung",
      letzterSync: "Letzter Abgleich {{datum}}",
      verbundenVon: "verbunden von {{name}}",
      verbundenVonUnbekannt: "wer verbunden hat, ist nicht erfasst",
    },
    col: {
      konto: "Konto",
      gesellschaft: "Gesellschaft",
      iban: "IBAN",
      bank: "Kreditinstitut",
      art: "Art",
      anbindung: "Anbindung",
    },
    karten: {
      suche: "Mitarbeiter, E-Mail oder Position suchen …",
      // The list comes live from Pleo, so "nobody" means nobody has a Pleo account, not that
      // nothing has been imported yet.
      keineMitarbeiter: "Keine Mitarbeiter bei Pleo",
      ohneName: "Ohne Namen",
      col: {
        mitarbeiter: "Mitarbeiter",
        email: "E-Mail",
        position: "Position",
        code: "Personalnummer",
      },
      dialog: {
        // Not "Karte bearbeiten": there is one row for the whole Pleo programme, not one per card.
        titel: "Pleo bearbeiten",
        button: "Pleo bearbeiten",
        // The same control, when there is no company yet. Naming the gap rather than the action,
        // because an unassigned programme means every Pleo movement is readable by everyone.
        zuordnen: "Gesellschaft zuordnen",
        text: "Zu welcher Gesellschaft die Pleo-Ausgaben gehören. Alle Umsätze folgen dieser Zuordnung.",
        gesellschaftPlaceholder: "Gesellschaft auswählen …",
        gesellschaftHinweis: "Gilt für alle Umsätze dieser Karte.",
        toastSaved: "Pleo aktualisiert.",
      },
    },
    keineGesellschaft: "Keine Gesellschaft",
    ohneGesellschaftTitle:
      "Ohne Gesellschaft sind die Umsätze dieses Kontos für ALLE angemeldeten Benutzer sichtbar, auch für auf eine Gesellschaft eingeschränkte. Außerdem fehlt das Konto in jeder gesellschaftsbezogenen Auswertung.",
    namensdubletteTitle:
      "Mehrere Konten tragen diesen Namen. Der Name kommt von BANKSapi und ist die Produktart, keine Bezeichnung. Über „Bearbeiten“ umbenennen; der Name bleibt dann beim nächsten Abgleich erhalten.",
    keineTreffer: {
      title: "Keine Treffer",
      hint: "Kein Konto passt zu Suche und Filtern. Suchbegriff ändern oder Filter zurücksetzen.",
    },
    filter: {
      suche: "Konten suchen (Name, IBAN, Inhaber) …",
      button: "Filter",
      title: "Konten filtern",
      // On and off is the only state an account has, so that is what the filter says. It used to
      // read Aktiv | Entfernt, over excluded_at, which meant a switched-off account was an "Aktiv"
      // row and the word was doing double duty.
      status: "Status",
      statusAktiv: "Aktive Konten",
      statusInaktiv: "Inaktive Konten",
      statusAlle: "Alle Konten",
      alleGesellschaften: "Alle Gesellschaften",
      alleBanksapi: "Alle Anbindungen",
      nurSandbox: "Nur Sandbox-Konten",
      zuruecksetzen: "Filter zurücksetzen",
    },
    // On/off for a single account. Deliberately not called "löschen": a BANKSapi-fed account
    // cannot be deleted at the source, so the next Abgleich would bring it straight back.
    aktiv: {
      label: "Konto aktiv",
      ausschalten: "Konto deaktivieren: keine neuen Umsätze mehr importieren",
      einschalten: "Konto wieder aktivieren: Umsätze werden wieder importiert",
      inaktivTitle:
        "Deaktiviert. Bereits importierte Umsätze bleiben erhalten, es kommen aber keine neuen mehr dazu.",
      toastAn: "Konto wieder aktiv.",
      toastAus: "Konto deaktiviert.",
      toastAusHinweis:
        "Bereits importierte Umsätze bleiben erhalten. Der nächste Abgleich holt für dieses Konto nichts Neues.",
      toastFehler: "Umschalten fehlgeschlagen: {{error}}",
    },
    // Detaching a whole bank. "Löschen" would be the wrong word: the accounts live at BANKSapi and
    // our tables mirror them, so what happens is that the ACCESS is removed at the bank.
    // Detaching a whole bank. "Löschen" would be the wrong word for the BANKSapi half: the accounts
    // live there and our tables mirror them, so what happens is that the ACCESS is removed.
    // Detaching a whole bank. Nothing leaves the database: the access is removed at BANKSapi and
    // everything it delivered is hidden, so a reconnect brings the accounts back untouched.
    trennen: {
      button: "Trennen",
      titel: "Verbindung zu {{bank}} trennen?",
      text: "Der Zugang wird zuerst bei der Bank entfernt. Schlägt das fehl, passiert hier nichts. Danach verschwindet alles, was diese Verbindung geliefert hat, aus dem Hub. Gelöscht wird nichts: Wird dieselbe Bank später erneut verbunden, kommen die Konten mit Gesellschaft, Namen und Einstellungen zurück, die alten Umsätze bleiben ausgeblendet und nur neue kommen hinzu.",
      wirdEntfernt: "Das verschwindet aus dem Hub:",
      zaehle: "Wird ermittelt …",
      zaehlenFehlgeschlagen:
        "Der Umfang konnte nicht ermittelt werden. Konten, Umsätze und Protokoll dieser Verbindung werden trotzdem ausgeblendet.",
      postenZugang: "Der Bankzugang bei BANKSapi (wird dort gelöscht)",
      postenKonten: "{{anzahl}} Konten dieser Verbindung",
      postenUmsaetze: "{{anzahl}} Umsätze dieser Verbindung",
      postenProtokoll: "{{anzahl}} Protokolleinträge dieser Verbindung",
      zugeordnet: "{{anzahl}} davon sind einem Beleg zugeordnet",
      zugeordnetHinweis:
        "Die Zuordnungen und die Bezahlt-Markierungen bleiben bestehen. Der Umsatz dahinter ist bis zum erneuten Verbinden aber nicht mehr einsehbar.",
      wort: "ENTFERNEN",
      tippen: "Zum Bestätigen „{{wort}}“ eingeben",
      abbrechen: "Abbrechen",
      bestaetigen: "Verbindung trennen",
      laeuft: "Trenne …",
      getrennt: "Getrennt",
      getrenntTitle: "Der Zugang wurde am {{datum}} im Hub getrennt.",
      toastOk: "Verbindung zu {{bank}} getrennt.",
      toastOkHinweis:
        "{{konten}} Konten und {{umsaetze}} Umsätze ausgeblendet. Beim erneuten Verbinden kommen die Konten zurück.",
      toastFehler: "Trennen fehlgeschlagen: {{error}}",
    },
    sandbox: "Sandbox",
    sandboxTitle: "Test-/Demodaten aus BANKSapi, kein echtes Konto.",
    banksapiVerbunden: "Verbunden",
    banksapiVerbundenTitle:
      "Konto kommt über eine BANKSapi-Bankverbindung herein. Umsätze werden automatisch abgerufen.",
    banksapiJa: "Verknüpfbar",
    banksapiNein: "Kein Provider",
    banksapiJaTitle: "BANKSapi-Provider hinterlegt: Konto kann verbunden werden.",
    banksapiNeinTitle: "Kein BANKSapi-Provider für diese Bank, nur EBICS/manuell.",
    empty: {
      title: "Keine Bankkonten",
      hint: "Konten kommen über eine Bankverbindung (BANKSapi) herein oder werden hier manuell angelegt.",
      // Without the permission for bank connections there is no "Bank verbinden" button on the
      // page, so pointing at that route would name a door this reader has no handle for.
      hintManuell:
        "Es ist noch kein Konto hinterlegt. Konten legt hier ein Administrator an oder sie kommen über eine Bankverbindung herein.",
    },
    // The sync log, now behind a button beside the sync state instead of filling its own screen.
    syncLog: {
      button: "Protokoll",
      titel: "Sync-Protokoll",
    },
    // The compact form beside the section heading. The long form below is the tooltip, so the
    // timestamp and the failure message are one hover away rather than gone.
    sync: {
      ok: "Synchronisiert {{ago}}",
      warn: "Abgleich {{ago}}, eine Quelle fehlgeschlagen",
      error: "Letzter Abgleich fehlgeschlagen",
      running: "Abgleich läuft",
      stalled: "Abgleich hängt seit {{ago}}",
      stale: "Kein Abgleich seit {{ago}}",
      never: "Noch kein Abgleich gelaufen",
    },
    // The long form, used as the tooltip on the line above. `when` is the timestamp, `ago` the
    // same moment in words.
    health: {
      ok: "Letzter Abgleich {{ago}} ({{when}})",
      warn: "Abgleich {{ago}} beendet, dabei ist eine Quelle fehlgeschlagen",
      error: "Der letzte Abgleich ist fehlgeschlagen ({{when}})",
      running: "Abgleich läuft, gestartet {{ago}}",
      stalled: "Abgleich seit {{ago}} gestartet und nie beendet",
      stale: "Seit {{ago}} kein Abgleich mehr gelaufen ({{when}})",
      never: "Es ist noch nie ein Abgleich gelaufen",
      detail: "{{umsaetze}} neue Umsätze · {{zuordnungen}} automatische Zuordnungen",
      uebersprungen_one: "{{count}} Lauf übersprungen, weil der vorige noch lief",
      uebersprungen_other: "{{count}} Läufe übersprungen, weil der vorige noch lief",
      ago: {
        jetzt: "gerade eben",
        min_one: "vor {{count}} Minute",
        min_other: "vor {{count}} Minuten",
        std_one: "vor {{count}} Stunde",
        std_other: "vor {{count}} Stunden",
        tage_one: "vor {{count}} Tag",
        tage_other: "vor {{count}} Tagen",
      },
    },
    // Shown after the customer returns from the BANKSapi webform (?bank=connected|error).
    verbunden: {
      titel: "Bankverbindung hergestellt",
      text: "Die Konten und Umsätze werden jetzt im Hintergrund importiert. Das kann einige Minuten dauern.",
    },
    verbindungFehler: {
      titel: "Bankverbindung nicht hergestellt",
      text: "Die Verbindung wurde abgebrochen oder von der Bank abgelehnt. Bitte versuchen Sie es noch einmal.",
    },
    dialog: {
      createButton: "Neues Konto",
      createTitle: "Bankkonto anlegen",
      editTitle: "Bankkonto bearbeiten",
      description:
        "Konten aus einer Bankverbindung tragen ihre Stammdaten selbst, meist reicht es hier, die Gesellschaft zuzuordnen.",
      cancel: "Abbrechen",
      save: "Speichern",
      saving: "Speichere …",
      toastCreated: "Konto angelegt.",
      toastUpdated: "Konto aktualisiert.",
      toastFailed: "Fehlgeschlagen: {{error}}",
    },
    entfernen: {
      toastZuordnungen: "{{anzahl}} Belegzuordnungen aufgehoben.",
      toastDateien: "{{anzahl}} Belegdateien gelöscht.",
      zaehle: "Ermittle, was gelöscht würde …",
      zaehlenFehlgeschlagen:
        "Der Umfang konnte nicht ermittelt werden. Es können trotzdem Umsätze, Belegzuordnungen und Belegdateien betroffen sein.",
      vorschau:
        "Gelöscht werden: {{umsaetze}} Umsätze, {{zuordnungen}} Belegzuordnungen und {{dateien}} Belegdateien. Das lässt sich nicht rückgängig machen.",
      vorschauLeer: "Dieses Konto hat noch keine Umsätze. Es geht nichts verloren.",
      button: "Konto entfernen",
      titel: "Konto „{{konto}}“ entfernen?",
      beschreibung:
        "Das Konto verschwindet aus dem Hub und wird nicht mehr importiert, auch wenn die Bank es weiterhin liefert. Bereits importierte Umsätze dieses Kontos werden gelöscht, samt ihrer Zuordnungen zu Belegen. Gedacht für private Konten, die versehentlich mitverbunden wurden, und für doppelte Konten.",
      grund: "Grund (optional)",
      grundPlatzhalter: "z. B. Privatkonto, gehört nicht in die Buchhaltung",
      abbrechen: "Abbrechen",
      bestaetigen: "Entfernen",
      laeuft: "Entferne …",
      toastOk: "Konto entfernt.",
      toastUmsaetze: "{{anzahl}} Umsätze gelöscht.",
      toastFehler: "Entfernen fehlgeschlagen: {{error}}",
    },
    entfernt: {
      bestaetigenTitel: "Konto „{{konto}}“ wiederherstellen?",
      bestaetigenText:
        "Das Konto wird wieder importiert. Die früher gelöschten Umsätze kommen dabei NICHT zurück: der nächste Abgleich holt nur, was die Bank noch vorhält. Belegzuordnungen und Belegdateien aus der Zeit davor sind endgültig verloren.",
      abbrechen: "Abbrechen",
      laeuft: "Stelle wieder her …",
      meta: "Entfernt am {{datum}} von {{von}}",
      wiederherstellen: "Wiederherstellen",
      toastOk: "Konto wiederhergestellt.",
      toastFehler: "Wiederherstellen fehlgeschlagen: {{error}}",
    },
  },
  bankverbindungen: {
    connectDialog: {
      button: "Bank verbinden",
      titel: "Bankkonto verbinden",
      beschreibung:
        "Der Kontoinhaber meldet sich bei seiner Bank an und bestätigt per TAN. Das passiert im Formular der BANKSapi, nicht hier.",
      warnungTitel: "Zwei Häkchen, die zwingend gesetzt werden müssen",
      checkbox1:
        "„Speicherung Ihrer Login-Daten erlauben“, sonst kann später nichts aktualisiert werden.",
      checkbox2:
        "„Hiermit willige ich ein, dass Finanzdaten … zum Abruf zur Verfügung gestellt werden“, steht UNTER der Kontoliste und ist NICHT vorausgewählt.",
      warnungHinweis:
        "Die Konten selbst sind vorausgewählt. Wer hier aufhört, glaubt alles verbunden zu haben, es kommt aber nichts an.",
      ipLabel: "Öffentliche IP-Adresse des Kontoinhabers",
      ipPlatzhalter: "z. B. 84.123.45.67 (leer lassen = automatisch erkennen)",
      ipHinweis:
        "Die Bank verlangt sie als Nachweis, dass ein echter Mensch den Vorgang auslöst. Bei einem begleiteten Termin hier die IP des Kontoinhabers eintragen: automatisch erkannt wird die IP des Aufrufers.",
      bestaetigung: "Ich habe den Kontoinhaber auf die beiden Häkchen hingewiesen.",
      starten: "Link erzeugen und öffnen",
      starte: "Erzeuge Link …",
      geoeffnet: "Das Formular wurde in einem neuen Fenster geöffnet.",
      linkLabel: "Link (falls das Fenster blockiert wurde)",
      einmalig:
        "Der Link ist nur EINMAL aufrufbar und nur kurz gültig. Zweimal öffnen macht ihn ungültig.",
      schliessen: "Schließen",
    },
    title: "Bankverbindungen",
    subtitle: "Verbundene Konten (BANKSapi) und die letzten Synchronisationen.",
    connect: "Bank verbinden",
    sync: "Jetzt synchronisieren",
    syncing: "Synchronisiere …",
    syncDisabled:
      "Noch deaktiviert: BANKSapi ist noch nicht live, es gibt aktuell nichts Echtes zu synchronisieren.",
    empty: {
      title: "Keine Bankverbindung",
      hint: "Verbinde ein Konto über „Bank verbinden“. Im Mock-Modus liefert „Jetzt synchronisieren“ Beispieldaten.",
    },
    col: {
      bankProvider: "Bank / Provider",
      konten: "Konten",
      status: "Status",
      letzterSync: "Letzter Sync",
      modus: "Modus",
    },
    weitereKonten: "+{{anzahl}} weitere anzeigen",
    wenigerKonten: "Weniger anzeigen",
    sandbox: "Sandbox / Mock",
    live: "Live",
    noLogs: "Noch keine Sync-Läufe.",
    logCol: {
      zeitpunkt: "Zeitpunkt",
      ereignis: "Ereignis",
      details: "Details",
    },
    keineKonten: "Liefert keine Konten",
    keineKontenTitle:
      "Diese Bankverbindung liefert derzeit kein Konto. Entweder wurde das Bank-Formular abgebrochen, die Zustimmung ist abgelaufen oder alle Konten wurden entfernt. bank-sync läuft weiterhin gegen sie.",
    leereHinweis:
      "{{anzahl}} Verbindung(en) liefern kein Konto. Sie wurden bisher ausgeblendet, obwohl der Abgleich weiterhin gegen sie läuft.",
    eingerichtet: "Eingerichtet {{datum}}",
    syncBestaetigen: {
      titel: "Jetzt synchronisieren?",
      textLive:
        "Der Abgleich läuft für alle {{anzahl}} Bankverbindungen und ruft dabei echte Daten bei der Bank ab. Es gibt keine Möglichkeit, nur eine einzelne Verbindung zu synchronisieren.",
      textSandbox:
        "Im Mock-/Sandbox-Modus erzeugt der Abgleich BEISPIELDATEN und schreibt sie in dieselben Tabellen wie echte Konten und Umsätze. Nur das Kennzeichen „Sandbox“ unterscheidet sie danach.",
      abbrechen: "Abbrechen",
      starten: "Synchronisieren",
    },
    webformBlocked: {
      hinweis: "Der Browser hat das Fenster der Bank blockiert.",
      link: "Bank-Formular jetzt öffnen",
    },
    syncEvent: {
      outgoing_match_run: "Abgleich Ausgangsrechnungen",
      accounts_excluded_skipped: "Entfernte Konten übersprungen",
      accounts_inactive_skipped: "Deaktivierte Konten übersprungen",
      connection_disconnected: "Bankverbindung getrennt",
      callback_received: "Rückmeldung der Bank",
      transactions_classified: "Umsätze klassifiziert",
      outgoing_invoices: "Ausgangsrechnungen geladen",
      outgoing_invoice_transaction_matches: "Zuordnungen Ausgangsrechnungen",
      sync_started: "Sync gestartet",
      accounts_fetched: "Konten geladen",
      transactions_fetched: "Umsätze geladen",
      match_run: "Abgleich durchgeführt",
      sync_finished: "Sync abgeschlossen",
      error: "Fehler",
    },
    counts: {
      accounts_linked: "verknüpfte Konten",
      outgoing_matches_auto: "autom. Zuordnungen (Ausgang)",
      outgoing_matches_candidate: "Vorschläge (Ausgang)",
      transactions_classified: "klassifizierte Umsätze",
      transactions: "Umsätze",
      accounts_excluded: "entfernte Konten",
      accounts: "Konten",
      transactions_new: "neue Umsätze",
      transactions_total: "Umsätze gesamt",
      matches_auto: "Auto-Abgleiche",
      matches_candidate: "Vorschläge",
    },
    toast: {
      webformOpened: "Bank-Webform geöffnet.",
      noWebform: "Keine Webform-URL erhalten.",
      connectFailed: "Fehlgeschlagen: {{error}}",
      syncDone: "Abgleich abgeschlossen: {{neu}} neue Umsätze, {{vorschlaege}} Vorschläge.",
      syncFailed: "Sync fehlgeschlagen: {{error}}",
    },
  },

  // Processing log (Protokoll). status.* keyed by DB status value.
  protokoll: {
    title: "Protokoll",
    subtitle: "Verarbeitungs-Log der eingehenden Belege: Eingang, Erkennung und Fehler.",
    search: "Betreff, Absender oder Grund suchen …",
    filterStatus: "Status",
    alleStatus: "Alle Status",
    chip: { filter: "Nach diesem Status filtern", clear: "Status-Filter aufheben" },
    count_one: "{{count}} Eintrag",
    count_other: "{{count}} Einträge",
    col: {
      zeitpunkt: "Zeitpunkt",
      betreff: "Betreff",
      absender: "Absender",
      status: "Status",
      grund: "Grund",
      aktionen: "Details",
    },
    empty: "Keine Protokoll-Einträge.",
    // Tabs: the screen is named "Protokoll" but only ever showed the ingestion pipeline. The change
    // history lived in change_history with no screen at all -- now the second tab (audit issue #10).
    tabs: { verarbeitung: "Verarbeitung", aenderungen: "Änderungen" },
    // The pipeline's overall verdict on a mail, lifted out of the reason string and shown as a tag
    // rather than as an English phrase leading the cell (audit issue #5).
    verdict: { needsReview: "Prüfung nötig", accepted: "Automatisch übernommen" },
    filter: {
      zeitraum: "Zeitraum",
      gesamterZeitraum: "Gesamter Zeitraum",
      heute: "Heute",
      letzte7Tage: "Letzte 7 Tage",
      letzte30Tage: "Letzte 30 Tage",
    },
    // Shown when the search term consists only of the filter's own delimiters, which cannot be
    // searched for. Previously the filter was silently dropped and the whole table came back.
    searchDropped:
      "Der Suchbegriff enthält nur Trennzeichen (, ( )) und kann nicht gesucht werden.",
    export: { csv: "CSV-Export" },
    row: { openInvoice: "Rechnung öffnen", details: "Eintrag anzeigen" },
    detail: {
      title: "Protokoll-Eintrag",
      zeitpunkt: "Zeitpunkt",
      betreff: "Betreff",
      absender: "Absender",
      absenderRoh: "Absender (Kopfzeile)",
      status: "Status",
      grund: "Grund",
      keinGrund: "Kein Grund hinterlegt.",
      beleg: "Zugeordnete Rechnung",
      belegOeffnen: "Rechnung öffnen",
      keinBeleg: "Diese Mail wurde zu keiner Rechnung verarbeitet.",
      schliessen: "Schließen",
      kopieren: "Volltext kopieren",
      kopiert: "Kopiert",
    },
    aenderungen: {
      subtitle: "Änderungs-Historie: wer hat was an welchem Datensatz geändert.",
      count_one: "{{count}} Änderung",
      count_other: "{{count}} Änderungen",
      search: "Akteur, Typ, Tabelle oder Text suchen …",
      empty: "Keine Änderungen.",
      col: {
        zeitpunkt: "Zeitpunkt",
        akteur: "Benutzer",
        typ: "Typ",
        tabelle: "Tabelle",
        datensatz: "Datensatz",
        text: "Beschreibung",
      },
    },
    status: {
      erkannt: "Erkannt",
      zu_pruefen: "Zu prüfen",
      fehler: "Fehler",
      duplikat: "Duplikat",
      kein_beleg_anhang: "Kein Beleg-Anhang",
      ausgeschlossen: "Ausgeschlossen",
      aufgeteilt: "Aufgeteilt",
      storage_nachgeholt: "Storage nachgeholt",
      uebersprungen: "Übersprungen",
    },
  },

  // Team & Rollen (Briefing Screen 17, Appendix A7)
  // What an admin reads next to each checkbox on Team & Rollen.
  //
  // THIS IS UI COPY, SO IT LIVES HERE, NOT IN THE DATABASE. The `permissions` table still carries
  // label/description columns and they remain the FALLBACK, so a key added by a future seed always
  // renders something rather than a raw key. But rewording an existing one should be a front-end
  // edit, not a migration against production.
  //
  // Keyed by the permission key itself, so the dots nest: `permissions.invoices.book.label`.
  // The label is a plain verb phrase saying what the person can DO. The description says the
  // consequence and the boundary, in words somebody outside accounting can follow.
  permissions: {
    invoices: {
      book: {
        label: "Rechnungsdaten bearbeiten",
        desc: "Beträge, Datum, Gesellschaft, Objekt und Notizen einer Rechnung ändern. Ohne dieses Recht kann man Rechnungen nur ansehen.",
      },
      approve: {
        label: "Rechnungen prüfen und weitergeben",
        desc: "Eine Rechnung in Prüfung nehmen, mit einer Rückfrage zurückgeben, ablehnen oder zur endgültigen Freigabe weiterreichen. Zum Bezahlen reicht das noch nicht.",
      },
      approve_final: {
        label: "Rechnungen endgültig freigeben",
        desc: "Die letzte Freigabe erteilen. Erst danach darf eine Rechnung überhaupt bezahlt werden.",
      },
      assign: {
        label: "Rechnung jemandem zuweisen",
        desc: "Eine Rechnung an eine bestimmte Person übergeben. Sie wird benachrichtigt und darf die Rechnung bearbeiten, auch wenn die Freigabe-Regel jemand anderen nennt.",
      },
      override_workflow: {
        label: "Freigabe-Ablauf übergehen",
        desc: "Jeden Status direkt setzen, ohne die beiden Freigaberechte zu besitzen. Gedacht, um einen versehentlich falsch gesetzten Status zu korrigieren. Das weitreichendste Recht in dieser Gruppe.",
      },
      pay: {
        label: "Geld überweisen",
        desc: "Eine Überweisung auslösen und eine Rechnung als bezahlt markieren. Wer die endgültige Freigabe erteilt hat, darf dieselbe Rechnung nicht bezahlen.",
      },
    },
    opos_whitelist: {
      write: {
        label: "Posten dauerhaft aus der Liste nehmen",
        desc: "Wiederkehrende Buchungen wie Gehälter oder Steuern aus den offenen Posten ausblenden, damit sie dort nicht dauerhaft als unerledigt stehen.",
      },
    },
    bank_accounts: {
      remove: {
        label: "Bankkonto löschen",
        desc: "Ein Bankkonto aus dem Hub entfernen. Die dazugehörigen Umsätze verschwinden mit. Lässt sich nicht rückgängig machen.",
      },
    },
    postfach: {
      settings: {
        label: "Postfach und Ablage einrichten",
        desc: "Festlegen, aus welchem E-Mail-Postfach Rechnungen geholt und in welchem Ordner sie abgelegt werden. Gilt für alle.",
      },
    },
    notifications: {
      settings: {
        label: "Benachrichtigungen fürs Team einrichten",
        desc: "Bestimmen, worüber das Team benachrichtigt wird und über welchen Kanal, zum Beispiel Slack.",
      },
    },
    page: {
      team: {
        label: "Team & Rollen öffnen",
        desc: "Die Liste der Personen und ihrer Rechte ansehen. Zum Anlegen oder Ändern von Personen braucht es zusätzlich die Rolle Administrator.",
      },
      papierkorb: {
        label: "Papierkorb öffnen",
        desc: "Gelöschte Einträge ansehen und wiederherstellen.",
      },
      freigabe_regeln: {
        label: "Freigabe-Regeln verwalten",
        desc: "Festlegen, wer welche Rechnungen prüft und freigibt.",
      },
      dateibenennung: {
        label: "Dateibenennung festlegen",
        desc: "Bestimmen, wie abgelegte Belege benannt werden.",
      },
      auswertungen: {
        label: "Auswertungen öffnen",
        desc: "Kosten und Zahlen je Gesellschaft ansehen.",
      },
      protokoll: {
        label: "Änderungsprotokoll öffnen",
        desc: "Nachvollziehen, wer wann was geändert hat.",
      },
      bankverbindungen: {
        label: "Bankverbindungen verwalten",
        desc: "Bankzugänge verbinden und trennen.",
      },
    },
  },
  team: {
    edit: {
      selbstHinweis:
        "Das ist Ihr eigenes Konto. Rolle und Aktiv-Status lassen sich hier nicht ändern, sonst sperren Sie sich aus einem Bereich aus, den nur ein aktiver Administrator erreicht.",
      rollenwechsel:
        "Rollenwechsel: {{von}} → {{nach}}. Damit ändern sich die Bereiche, die diese Person sehen und ändern darf.",
      zugriffAusweitung:
        "Keine Gesellschaft ausgewählt bedeutet Zugriff auf ALLE Gesellschaften, das erweitert den Zugriff, statt ihn zu entziehen.",
      emailChangeHint:
        "Ändert auch die Anmelde-E-Mail, die Person meldet sich künftig mit dieser Adresse an.",
      superAdminHint:
        "Der Super-Admin hat Zugriff auf alles. Rolle und Gesellschafts-Zugriff lassen sich nicht ändern, nur der Name.",
      superAdminCannotBeDeactivated: "Der Super-Admin kann nicht deaktiviert werden.",
    },
    list: {
      rechteAnzahl: "{{n}} von {{gesamt}}",
      rechteAlle: "alle",
      suche: "Name, E-Mail oder Rolle suchen …",
      nurInaktive: "Nur inaktive",
      title: "Team & Rollen",
      subtitle: "Mitarbeiter, Rollen und Firmenzugriff verwalten.",
      col: {
        rechte: "Rechte",
        name: "Name",
        email: "E-Mail",
        role: "Rolle",
        companies: "Gesellschaften",
        active: "Aktiv",
      },
      empty: "Noch keine Mitarbeiter angelegt.",
      neu: { button: "Neuer Mitarbeiter" },
      action: {
        bearbeiten: "Bearbeiten",
        deaktivieren: "Deaktivieren",
        reaktivieren: "Reaktivieren",
        passwortZuruecksetzen: "Passwort zurücksetzen",
      },
    },
    role: {
      super_admin: "Super-Admin",
      admin: "Admin",
      supervisor: "Vorgesetzter",
      assistant: "Assistenz",
      toast: { fehlgeschlagen: "Rolle konnte nicht geändert werden: {{error}}" },
    },
    tab: {
      personen: "Personen",
      rollen: "Rollen & Rechte",
    },
    rollenrechte: {
      titel: "Rollen & Rechte",
      hinweis:
        "Legt fest, was eine Rolle standardmäßig erlaubt. Eine Änderung gilt sofort für alle Personen mit dieser Rolle, außer für die, bei denen unter „Personen“ eine Ausnahme gesetzt ist.",
      spalte: "Was erlaubt ist",
    },
    chain: {
      titel: "Freigabe-Einstellungen",
      bereich: "Zuständigkeitsbereich",
      bereichHint:
        "Bestimmt, für welche Gesellschaften diese Person automatisch als Schritt 2 vorgeschlagen wird.",
      bereichBrauchtRecht:
        "Nur für Personen mit dem Recht „Endgültig freigeben“. Ohne dieses Recht würde die Rechnung bei jemandem landen, der sie nicht freigeben kann.",
      bereichKonflikt:
        "Für den Bereich „{{bereich}}“ ist bereits eine andere aktive Person zuständig. Bitte diese zuerst entfernen.",
      vertretung: "Vertretung (bei Abwesenheit)",
      vertretungHint:
        "Wird in der Überfälligkeits-Warnung genannt. Die Vertretung erhält dadurch keine zusätzlichen Rechte.",
      eskalation: "Eskalation nach (Tagen)",
      eskalationHint:
        "Nach so vielen Tagen ohne Bewegung wird eine Rechnung, die auf diese Person wartet, als überfällig markiert. Leer lassen für keine Warnung.",
      gespeichert: "Gespeichert.",
    },
    permissions: {
      titel: "Was diese Person darf",
      hinweis:
        "Standardmäßig gilt, was die Rolle erlaubt. Hier setzen Sie Ausnahmen für diese eine Person — an- oder abwählen.",
      // Group headings above the checkboxes. Named after what the group lets somebody DO, not
      // after the part of the system it belongs to: "Seiten" told the reader nothing about what
      // ticking a box in it would allow.
      kategorie: {
        buchhaltung: "Rechnungen bearbeiten",
        freigabe: "Freigeben",
        zahlung: "Geld und Bank",
        system: "Einstellungen fürs Team",
        seiten: "Zugang zu Bereichen",
      },
    },
    rights: {
      buchhaltung: "Buchhaltung",
      buchhaltungHint: "Darf Belege buchen/prüfen.",
      freigabe: "Freigabe",
      freigabeHint: "Darf Belege freigeben.",
      zahlung: "Zahlung",
      zahlungHint: "Darf Belege als bezahlt markieren / Zahlungslauf ausführen.",
      impliedByAdmin: "Admins sind für alle drei Rechte automatisch berechtigt.",
      nichtVergebbar:
        "Ausgegraute Rechte haben Sie selbst nicht und können sie deshalb nicht weitergeben.",
      nurAdmin: "Nur ein Administrator kann ändern, was eine Person darf.",
      impliedBySuperAdmin: "Der Super-Admin hat immer alle Rechte.",
    },
    access: {
      weitere: "+{{count}} weitere",
      schritt: {
        profil: "Profil",
        rolle: "Rolle",
        zugriff: "Gesellschafts-Zugriff",
        rechte: "Rechte",
      },
      alle: "Alle",
      dialog: {
        title: "Person bearbeiten",
        desc: "Profil, Rolle, Gesellschaften und Rechte dieser Person.",
        leerHinweis: "Keine Auswahl = uneingeschränkter Zugriff auf alle Gesellschaften.",
        cancel: "Abbrechen",
        save: "Speichern",
        saving: "Speichert …",
      },
      toast: {
        teilweise:
          "Speichern fehlgeschlagen beim Schritt „{{schritt}}“. Vorherige Schritte wurden bereits gespeichert: {{error}}",
        gespeichert: "Firmenzugriff gespeichert.",
        fehlgeschlagen: "Firmenzugriff konnte nicht gespeichert werden: {{error}}",
      },
    },
    status: { aktiv: "Aktiv", inaktiv: "Inaktiv", nieAngemeldet: "noch nie angemeldet" },
    deactivate: {
      title: "Mitarbeiter deaktivieren",
      desc: "{{email}} kann sich danach nicht mehr anmelden. Bisherige Freigaben und Notizen bleiben erhalten.",
      cancel: "Abbrechen",
      confirm: "Deaktivieren",
      toast: {
        ok: "Mitarbeiter deaktiviert.",
        fehlgeschlagen: "Konnte nicht geändert werden: {{error}}",
      },
    },
    reactivate: {
      title: "Mitarbeiter reaktivieren",
      desc: "{{email}} kann sich danach wieder anmelden.",
      confirm: "Reaktivieren",
      toast: { ok: "Mitarbeiter reaktiviert." },
    },
    new: {
      title: "Neuer Mitarbeiter",
      desc: "Legt ein Konto an. Die Person erhält ein Einmal-Passwort und muss es beim ersten Login ändern.",
      field: {
        name: "Name",
        email: "E-Mail",
        role: "Rolle",
        companies: "Gesellschaften",
        companiesAlle: "Alle Gesellschaften",
        companiesWaehlen: "Gesellschaften wählen …",
        companiesLeerHinweis: "Keine Auswahl = uneingeschränkter Zugriff auf alle Gesellschaften.",
      },
      cancel: "Abbrechen",
      save: "Anlegen",
      saving: "Legt an …",
      toast: {
        emailUngueltig: "Bitte eine gültige E-Mail-Adresse eingeben.",
        emailVergeben: "Diese E-Mail-Adresse ist bereits vergeben.",
        rechteFehlgeschlagen:
          "Konto angelegt, aber die Rechte-Ausnahmen konnten nicht gespeichert werden: {{error}}",
        emailPflicht: "Bitte E-Mail-Adresse eingeben.",
        namePflicht: "Bitte Namen eingeben.",
        fehlgeschlagen: "Mitarbeiter konnte nicht angelegt werden: {{error}}",
      },
    },
    tempPassword: {
      copyFailed:
        "Kopieren nicht möglich (Zwischenablage nicht verfügbar). Bitte das Passwort manuell übernehmen, bevor Sie schließen.",
      title: "Konto angelegt",
      desc: "Einmal-Passwort für {{email}}. Bitte jetzt sicher weitergeben, es wird nicht erneut angezeigt.",
      copy: "Kopieren",
      close: "Fertig",
    },
    resetPassword: {
      title: "Passwort zurücksetzen",
      desc: "Setzt für {{email}} ein neues Einmal-Passwort. Das bisherige Passwort wird sofort ungültig, die Person muss beim nächsten Login ein eigenes Passwort vergeben.",
      cancel: "Abbrechen",
      confirm: "Zurücksetzen",
      tempPasswordTitle: "Passwort zurückgesetzt",
      tempPasswordDesc:
        "Neues Einmal-Passwort für {{email}}. Bitte jetzt sicher weitergeben, es wird nicht erneut angezeigt.",
      toast: {
        fehlgeschlagen: "Passwort konnte nicht zurückgesetzt werden: {{error}}",
      },
    },
  },

  // Papierkorb (Briefing Screen 18)
  papierkorb: {
    list: {
      title: "Papierkorb",
      subtitle: "Gelöschte Datensätze: wiederherstellbar oder endgültig löschbar.",
      empty: "Papierkorb ist leer.",
    },
    filter: { alle: "Alle Typen" },
    search: {
      label: "Papierkorb durchsuchen",
      placeholder: "Bezeichnung, Grund oder Person suchen",
    },
    alter: {
      label: "Alter",
      alle: "Jedes Alter",
      d30: "Älter als 30 Tage",
      d90: "Älter als 90 Tage",
      d365: "Älter als 1 Jahr",
    },
    age: {
      heute: "heute gelöscht",
      tage_one: "vor {{count}} Tag",
      tage_other: "vor {{count}} Tagen",
      monate_one: "vor {{count}} Monat",
      monate_other: "vor {{count}} Monaten",
      jahre_one: "vor {{count}} Jahr",
      jahre_other: "vor {{count}} Jahren",
    },
    sort: { asc: "aufsteigend sortieren", desc: "absteigend sortieren" },
    auswahl: {
      anzahl_one: "{{count}} ausgewählt",
      anzahl_other: "{{count}} ausgewählt",
      seite: "Alle auf dieser Seite auswählen",
      alleGefiltert: "Alle {{count}} Einträge auswählen",
      alleGewaehlt: "Alle {{count}} Einträge sind ausgewählt.",
      zeile: "'{{label}}' auswählen",
      aufheben: "Auswahl aufheben",
      wiederherstellen: "Wiederherstellen ({{count}})",
      loeschen: "Endgültig löschen ({{count}})",
      nichtsPurgebar:
        "Von der Auswahl können {{count}} Datensätze nicht endgültig gelöscht werden; sie bleiben im Papierkorb.",
    },
    seiten: {
      label: "Seitennummerierung",
      zurueck: "Vorherige Seite",
      weiter: "Nächste Seite",
      status: "Seite {{seite}} von {{gesamt}}",
      eintraege_one: "{{count}} Eintrag",
      eintraege_other: "{{count}} Einträge",
      gefiltert: "{{gezeigt}} von {{gesamt}} Einträgen",
    },
    grundVoll: { mehr: "Ganzen Grund anzeigen", titel: "Löschgrund", schliessen: "Schließen" },
    guard: {
      titel: "Kein Zugriff auf den Papierkorb",
      text: "Der Papierkorb ist nur für Administratoren. Ihr Konto hat diese Rolle nicht, deshalb sehen Sie hier keine gelöschten Datensätze. Wenn Sie etwas wiederherstellen müssen, wenden Sie sich an eine Administratorin oder einen Administrator.",
      zurueck: "Zur Übersicht",
    },
    col: {
      typ: "Typ",
      bezeichnung: "Bezeichnung",
      gelöschtAm: "Gelöscht am",
      gelöschtVon: "Gelöscht von",
      grund: "Grund",
    },
    action: { wiederherstellen: "Wiederherstellen", endgueltigLoeschen: "Endgültig löschen" },
    restore: {
      title: "Wiederherstellen",
      desc: "'{{label}}' wird wieder in die aktive Liste aufgenommen und wirkt sofort wieder, Regeln greifen erneut, Belege laufen wieder im Workflow mit.",
      grundLabel: "Grund (optional)",
      grundPlaceholder: "Warum wird das wiederhergestellt?",
      cancel: "Abbrechen",
      confirm: "Wiederherstellen",
      toast: {
        ok: "'{{label}}' wiederhergestellt.",
        fehlgeschlagen: "Wiederherstellen fehlgeschlagen: {{error}}",
        mehrere_one: "{{count}} Datensatz wiederhergestellt.",
        mehrere_other: "{{count}} Datensätze wiederhergestellt.",
      },
    },
    purge: {
      title: "Endgültig löschen",
      desc: "'{{label}}' wird unwiderruflich gelöscht. Dies kann nicht rückgängig gemacht werden.",
      cancel: "Abbrechen",
      confirm: "Endgültig löschen",
      gobdGesperrt:
        "Eingangsrechnungen können nicht endgültig gelöscht werden (GoBD: Belege dürfen nur deaktiviert, nie hart gelöscht werden). Wiederherstellen ist weiterhin möglich.",
      referenzGesperrt:
        "Kann nicht endgültig gelöscht werden: Freigabe-Regeln und Vertretungen verweisen auf diesen Namen. Wiederherstellen ist weiterhin möglich.",
      titelMehrere: "{{count}} Datensätze endgültig löschen",
      descMehrere:
        "{{count}} Datensätze werden unwiderruflich gelöscht. Dies kann nicht rückgängig gemacht werden.",
      toast: {
        ok: "'{{label}}' endgültig gelöscht.",
        fehlgeschlagen: "Löschen fehlgeschlagen: {{error}}",
        mehrere_one: "{{count}} Datensatz endgültig gelöscht.",
        mehrere_other: "{{count}} Datensätze endgültig gelöscht.",
      },
    },
    table: {
      invoices: "Eingangsrechnungen",
      suppliers: "Lieferanten",
      customers: "Kunden",
      outgoing_invoices: "Ausgangsrechnungen",
      manual_bookings: "Manuelle Buchungen",
      approval_rules: "Freigabe-Regeln",
      assignment_rules: "Zuordnungsregeln",
      ingest_exclusions: "Ausschlussregeln",
      opos_whitelist_rules: "Ausgeschlossene Zahlungen",
      bwa_categories: "Kategorien",
      properties: "Objekte",
      companies: "Gesellschaften",
      approvers: "Genehmiger",
      supplier_bank_accounts: "Bankverbindungen",
    },
  },

  // shared query states used by invoice screens
  queryState: {
    errorTitle: "Daten konnten nicht geladen werden",
    errorUnknown: "Unbekannter Fehler beim Laden der Daten.",
    retry: "Erneut versuchen",
  },
} as const;

export default de;
