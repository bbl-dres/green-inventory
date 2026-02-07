# Anforderungskatalog — Grünflächeninventar GIS

**Pflichtenheft für Eigenentwicklung**
Version 0.4 — Entwurf | Februar 2026 | Klassifikation: Intern

---

## 1. Einleitung

### 1.1 Zweck des Dokuments

Dieses Pflichtenheft beschreibt die funktionalen und nicht-funktionalen Anforderungen an ein webbasiertes GIS-System zur Inventarisierung, Bewirtschaftung und Pflege von Grünflächen. Das System soll eine kartenzentrische Anwendung bereitstellen, die alle relevanten Geodaten, Pflegeprofile, Massnahmen und Kosteninformationen in einer integrierten Plattform zusammenführt.

### 1.2 Geltungsbereich

Der Anforderungskatalog deckt die Eigenentwicklung eines Grünflächeninventarsystems ab. Die Anforderungen sind nach dem MoSCoW-Schema priorisiert und modular strukturiert, um eine iterative Umsetzung zu ermöglichen.

### 1.3 Referenzdokumente

Die Pflegeprofil-Struktur orientiert sich massgeblich an den folgenden Referenzdokumenten der Stadt Zürich / Grün Stadt Zürich (Projekt «Mehr als Grün», ZHAW, 2019):

| Dokument | Beschreibung |
|----------|-------------|
| **Profilkatalog naturnahe Pflege** | Umfassendes Nachschlagewerk mit 31 Grünraumprofilen, inkl. Pflegemassnahmen, Ökologie-Bewertung und Spannungsfeld Nutzung–Gestaltung–Ökologie. |
| **Praxishandbuch naturnahe Pflege** | Kompakte Praxisblätter (Doppelseite pro Profil) für den Feldeinsatz, mit Massnahmen-Tabellen und Qualitätsbewertungen. |
| **Jahrespflegeplaner** | Excel-basierter Planer mit objektspezifischen Pflegemassnahmen, Zeitpunkten, Intervallen und Maschinenzuordnung. |
| **Pflegeübersichtspläne** | Katasterplan-basierte Darstellung aller Pflegeprofile eines Objekts mit Farbcodierung und Profilcodes. |

Diese Dokumente definieren die fachliche Grundstruktur der Pflegeprofil-Bibliothek und dienen als Vorlage für die vorkonfigurierten Standardprofile im System.

### 1.4 MoSCoW-Priorisierung

| Priorität | Bedeutung |
|-----------|-----------|
| **Must**   | Zwingende Anforderung. Ohne diese Funktion ist das System nicht einsetzbar. |
| **Should** | Wichtige Anforderung. Sollte im Standardumfang enthalten sein. |
| **Could**  | Wünschenswerte Anforderung. Kann in einer späteren Phase umgesetzt werden. |
| **Won't**  | Wird für diese Version nicht umgesetzt, aber für zukünftige Releases vorgemerkt. |

### 1.5 Begriffe und Abkürzungen

| Abkürzung | Bedeutung |
|-----------|-----------|
| AV | Amtliche Vermessung |
| BIM | Building Information Modeling |
| CAD | Computer-Aided Design |
| CRS | Coordinate Reference System |
| GIS | Geoinformationssystem |
| GSZ | Grün Stadt Zürich |
| IFC | Industry Foundation Classes |
| ÖREB | Öffentlich-rechtliche Eigentumsbeschränkungen |
| PWA | Progressive Web App |
| WFS | Web Feature Service |
| WMS | Web Map Service |
| WMTS | Web Map Tile Service |

---

## 2. Kartenmodul (Karte & Geodaten)

Das Kartenmodul bildet das Herzstück der Anwendung. Es stellt eine interaktive, webbasierte Karte bereit, auf der sämtliche Grünflächen, Bäume und zugehörige Objekte visualisiert, analysiert und bearbeitet werden können.

### 2.1 Kartenansicht und Navigation

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| K-001 | **Must** | Interaktive Webkarte | Bereitstellung einer performanten, interaktiven Webkarte (z.B. basierend auf Mapbox GL JS, OpenLayers oder Leaflet) mit stufenlosem Zoom, Pan und Rotation. |
| K-002 | **Must** | Koordinatensystem CH | Unterstützung von LV95 (EPSG:2056) als primäres CRS. Zusätzlich WGS84 (EPSG:4326) für Import/Export. |
| K-003 | **Must** | Vollbildmodus | Die Karte kann im Vollbildmodus dargestellt werden, mit ein-/ausblendbaren Seitenleisten. |
| K-004 | Should | Bookmarks / Favoriten | Benutzer können Kartenausschnitte als Favoriten speichern und schnell wieder aufrufen. |
| K-005 | Could | 3D-Darstellung | Optionale 3D-Ansicht für Gelände und Gebäudemodelle (z.B. Terrain-Layer, LOD2-Gebäude). |

### 2.2 Layer-Management

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| K-010 | **Must** | Multi-Layer-Architektur | Unterstützung für mehrere gleichzeitig darstellbare Layer mit individueller Transparenz, Sichtbarkeit und Z-Order. |
| K-011 | **Must** | Layer-Panel | Ein Layer-Panel ermöglicht das Ein-/Ausblenden, Gruppieren und Umsortieren von Layern. |
| K-012 | **Must** | Basiskarten-Auswahl | Umschaltbare Basiskarten: swisstopo Landeskarte, Orthofoto (SWISSIMAGE), OpenStreetMap, neutraler Hintergrund. |
| K-013 | Should | Benutzerdefinierte Layer | Benutzer können eigene WMS-/WMTS-/WFS-Layer hinzufügen und konfigurieren. |
| K-014 | Should | Thematische Darstellung | Layer können nach Attributen eingefärbt werden (Choropleth, Kategorien, Heatmaps). |
| K-015 | Could | Layer-Transparenz-Slider | Stufenlose Transparenzregelung pro Layer über einen Schieberegler. |

### 2.3 Öffentliche Geodaten-Integration

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| K-020 | **Must** | swisstopo WMTS | Integration der swisstopo-Dienste: Landeskarte, SWISSIMAGE (Orthofoto), swissTLM3D über WMTS. |
| K-021 | **Must** | Amtliche Vermessung (AV) | Darstellung der AV als Layer: Liegenschaften, Gebäude, Bodenbedeckung, Einzelobjekte. |
| K-022 | **Must** | ÖREB-Kataster | Abruf und Darstellung von ÖREB-Daten (Nutzungsplanung, Gewässerschutzzonen, Waldgrenzen etc.) über den offiziellen ÖREB-Webservice. |
| K-023 | Should | Kommunale/kantonale GIS-Daten | Einbindung kommunaler und kantonaler Geodienste (z.B. kantonaler GIS-Browser) über WMS/WFS. |
| K-024 | Should | geocat.ch Katalogsuche | Durchsuchbare Integration des Schweizer Geometadatenkatalogs geocat.ch zur dynamischen Layersuche. |
| K-025 | Could | Automatische CRS-Transformation | Automatische Koordinatentransformation beim Import von Daten in abweichenden Koordinatensystemen. |

### 2.4 Messwerkzeuge

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| K-030 | **Must** | Distanzmessung | Messen von Distanzen (Linie, Polylinie) auf der Karte mit Anzeige in Metern/Kilometern. |
| K-031 | **Must** | Flächenmessung | Messen von Flächen (Polygon) mit Anzeige in m² / ha. |
| K-032 | Should | Koordinatenanzeige | Anzeige der Mausposition in LV95 und WGS84 Koordinaten. |
| K-033 | Should | Höhenprofil | Erstellung eines Höhenprofils entlang einer gezeichneten Linie (basierend auf swissALTI3D). |
| K-034 | Could | Puffer-Analyse | Generierung von Pufferzonen um ausgewählte Objekte mit definierbarem Radius. |

---

## 3. Inventarmodul (Grünflächen & Objekte)

Das Inventarmodul dient der Erfassung, Verwaltung und Geometrie-Bearbeitung aller Grünflächen-Objekte. Es unterscheidet zwischen Flächenobjekten (Polygone), Linienobjekten und Punktobjekten (z.B. Bäume, Mobiliar).

### 3.1 Objekttypen

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| I-001 | **Must** | Grünflächen-Polygone | Erfassung von Grünflächen als Polygone mit Attributen: Profiltyp (gemäss Profilkatalog), Fläche (m²), Zustand, Zuständigkeit, Nutzungsintensität. |
| I-002 | **Must** | Baumkataster (Punkte) | Erfassung von Einzelbäumen als Punktobjekte: Baumart, Stammumfang, Kronendurchmesser, Pflanzjahr, Zustand, Schutzstatus, Profilzuordnung (Parkbaum / Strassenbaum / Obstbaum). |
| I-003 | Should | Linienobjekte | Erfassung von Hecken (Form-/Wildhecken), Mauern, Zäunen und Wegen als Linienobjekte. |
| I-004 | Should | Mobiliar & Ausstattung | Erfassung von Bänken, Brunnen, Spielgeräten etc. als Punktobjekte mit Typisierung. |
| I-005 | Should | Strukturelemente | Erfassung ökologischer Strukturelemente (Trockenmauern, Asthaufen, Steinhaufen, Nisthilfen, Totholz) als Punkt- oder Polygonobjekte gemäss GSZ-Profilkatalog. |
| I-006 | Should | Belagsflächen | Erfassung von Hartbelägen innerhalb des Perimeters (Chaussierung, Pflasterung, Fallschutz, Asphalt) als Polygone mit Profilzuordnung. |
| I-007 | Should | Gewässer | Erfassung von Gewässern (ruhend, fliessend, Brunnen/Wasserbecken) als Polygon- oder Linienobjekte. |
| I-008 | Could | Gruppierung / Cluster | Zusammenfassung mehrerer Objekte zu logischen Gruppen (z.B. Parkanlage mit allen Teilflächen) analog dem GSZ-Pflegeübersichtsplan. |

### 3.2 Geometrie-Editing im Web

Das Editing-Modul stellt geometriespezifische Werkzeuge bereit. Die Werkzeugleiste passt sich dynamisch dem Geometrietyp des aktiven Layers an — Polygon-Werkzeuge erscheinen nur bei Polygon-Layern, Punkt-Werkzeuge nur bei Punkt-Layern usw. Immer nur ein Layer ist gleichzeitig editierbar.

#### 3.2.1 Polygon-Operationen (Grünflächen, Standortperimeter, Belagsflächen)

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| I-010 | **Must** | Polygon erstellen | Zeichnen neuer Polygone direkt auf der Karte durch Klicken von Stützpunkten. Doppelklick oder Klick auf den ersten Punkt schliesst das Polygon. Snapping an bestehende Geometrien. |
| I-011 | **Must** | Polygon bearbeiten | Verschieben, Hinzufügen und Löschen von Stützpunkten bestehender Polygone. Klick auf Mittelpunktgriffe fügt neue Stützpunkte ein. |
| I-012 | **Must** | Polygon Split | Teilen eines Polygons durch Zeichnen einer Schnittlinie. Erzeugt zwei neue Polygone. Attribute werden wahlweise kopiert oder aufgeteilt (Dialog). |
| I-013 | **Must** | Polygon Join/Merge | Zusammenführen von zwei oder mehr angrenzenden Polygonen zu einem einzelnen Polygon (Union). Attribut-Konfliktlösung per Dialog. |
| I-040 | **Must** | Polygon verschieben | Verschieben eines kompletten Polygons per Drag-and-Drop im Selektionsmodus. |
| I-041 | **Must** | Polygon löschen | Entfernen eines selektierten Polygons mit Bestätigungsdialog. |
| I-042 | Should | Polygon-Loch schneiden | Erstellen eines inneren Rings (Loch) durch Zeichnen eines Polygons innerhalb eines bestehenden Polygons (Differenz). Anwendung: Teich innerhalb einer Wiese. |
| I-043 | Should | Polygon umformen | Hinzufügen oder Entfernen von Fläche durch Zeichnen eines überlappenden Polygons (Union/Differenz). |
| I-044 | Should | Polygon duplizieren | Kopieren eines Polygons inkl. Attribute an eine neue Position. |
| I-045 | Should | Fläche automatisch berechnen | Automatische Berechnung von `areaM2` bei Erstellung und Bearbeitung. Anzeige der Fläche in m² während des Zeichnens. |
| I-046 | Could | Polygon vereinfachen | Reduktion der Stützpunktanzahl unter Beibehaltung der Form (Douglas-Peucker). Nützlich nach GPS-Import. |
| I-047 | Could | Puffer generieren | Erzeugung einer Pufferzone um ein Polygon mit definierbarem Abstand (z.B. Baumschutzzone). |

#### 3.2.2 Punkt-Operationen (Bäume, Mobiliar, Strukturelemente)

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| I-014 | **Must** | Punkt platzieren | Setzen von Punktobjekten per Klick auf die Karte. Sofortige Öffnung des Attributformulars nach Platzierung. |
| I-050 | **Must** | Punkt verschieben | Verschieben eines bestehenden Punktobjekts per Drag-and-Drop. Koordinaten-Feedback während des Verschiebens. |
| I-051 | **Must** | Punkt löschen | Entfernen eines selektierten Punktobjekts mit Bestätigungsdialog. |
| I-052 | Should | Punkt duplizieren | Kopieren eines Punktobjekts inkl. Attribute an eine neue Position. Nützlich bei Erfassung ähnlicher Objekte (z.B. mehrere Bänke). |

#### 3.2.3 Linien-Operationen (Hecken, Wege, Mauern, Gewässerränder)

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| I-055 | **Must** | Linie erstellen | Zeichnen neuer Linienobjekte durch Klicken von Stützpunkten. Doppelklick oder Enter beendet die Linie. |
| I-056 | **Must** | Linie bearbeiten | Verschieben, Hinzufügen und Löschen von Stützpunkten bestehender Linien. |
| I-057 | **Must** | Linie verschieben | Verschieben einer kompletten Linie per Drag-and-Drop. |
| I-058 | **Must** | Linie löschen | Entfernen einer selektierten Linie mit Bestätigungsdialog. |
| I-059 | Should | Linie teilen | Aufteilen einer Linie an einem gewählten Punkt in zwei separate Linienobjekte. |
| I-060 | Should | Linien verbinden | Zusammenführen zweier Linien mit gemeinsamem Endpunkt zu einer einzigen Linie. |
| I-061 | Should | Linie verlängern | Anfügen weiterer Stützpunkte an einem Ende einer bestehenden Linie. |
| I-062 | Should | Länge automatisch berechnen | Automatische Berechnung von `lengthM` bei Erstellung und Bearbeitung. Anzeige der Länge in Metern während des Zeichnens. |

#### 3.2.4 Selektion

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| I-065 | **Must** | Klick-Selektion | Auswahl eines einzelnen Objekts per Klick auf der Karte. Visuelle Hervorhebung (Konturfarbe, Stützpunktanzeige). |
| I-066 | **Must** | Multi-Selektion | Hinzufügen/Entfernen einzelner Objekte zur Selektion per Shift+Klick. |
| I-067 | **Must** | Rechteck-Selektion | Aufziehen eines Auswahlrechtecks zur Selektion aller Objekte innerhalb des Rechtecks. |
| I-068 | **Must** | Layer-Selektierbarkeit | Nur der aktiv bearbeitete Layer ist selektierbar. Andere Layer bleiben sichtbar, aber nicht interaktiv (verhindert Fehlselektion). |
| I-069 | Should | Lasso-Selektion | Freihand-Selektion durch Zeichnen einer beliebigen Form. Nützlich für Selektion entlang irregulärer Zonen. |
| I-070 | **Must** | Selektion aufheben | Aufheben der Selektion per Escape-Taste oder Klick in leeren Kartenbereich. |

#### 3.2.5 Bearbeitungsworkflow

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| I-075 | **Must** | Expliziter Bearbeitungsmodus | Bearbeitung wird über eine Schaltfläche pro Layer aktiviert. Standardmodus ist schreibgeschützt (Kartennavigation). Banner zeigt den aktiv bearbeiteten Layer an. |
| I-076 | **Must** | Explizites Speichern/Verwerfen | Geometrie-Änderungen werden lokal gesammelt. Speichern-Schaltfläche persistiert alle Änderungen, Abbrechen-Schaltfläche verwirft sie. Kein Auto-Save. |
| I-077 | **Must** | Warnung bei ungesicherten Änderungen | Beim Verlassen des Bearbeitungsmodus oder Wechsel des Layers mit ungesicherten Änderungen erscheint ein Bestätigungsdialog. |
| I-016 | Should | Undo/Redo | Mehrstufiges Rückgängigmachen (Ctrl+Z) und Wiederholen (Ctrl+Y) von Geometrie-Änderungen. Mindestens 30 Aktionen im Undo-Stack. Visueller Zustand der Undo/Redo-Schaltflächen (aktiv/inaktiv). |
| I-017 | Should | Mutation History | Versionierung aller Geometrie-Änderungen mit Zeitstempel, Benutzer und Änderungsbeschreibung. |
| I-078 | Should | Inline-Attributerfassung | Bei Erstellung eines neuen Objekts öffnet sich sofort das Attributformular im Seitenpanel. Geometrie und Attribute werden als eine Aktion gespeichert. |

#### 3.2.6 Zeichenhilfen

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| I-015 | **Must** | Snapping an Stützpunkte | Fangen an bestehenden Stützpunkten mit konfigurierbarer Toleranz (Standard: 12px). Visueller Indikator bei aktivem Snapping. Ein-/Ausschalten per Tastenkürzel (S). |
| I-080 | Should | Snapping an Kanten | Fangen an der nächsten Position auf einer bestehenden Kante (nicht nur Stützpunkte). |
| I-081 | Should | Snapping über Layer hinweg | Fangen an Geometrien anderer Layer (z.B. Grünfläche an Standortperimeter ausrichten). |
| I-082 | Should | Masslinie beim Zeichnen | Anzeige der Segmentlänge und Gesamtlänge/-fläche in Echtzeit während des Zeichnens. |
| I-018 | Could | Sketching-Modus | Freihand-Zeichnungsmodus für schnelle Entwürfe, konvertierbar in saubere Polygone. |

#### 3.2.7 Geometrie-Validierung

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| I-019 | **Must** | Selbstüberschneidung | Automatische Erkennung von Selbstüberschneidungen bei Polygonen. Warnung vor dem Speichern mit visueller Markierung der Problemstelle. |
| I-085 | **Must** | Minimum-Stützpunkte | Polygone benötigen mindestens 3, Linien mindestens 2 eindeutige Stützpunkte. Verhinderung ungültiger Geometrien. |
| I-086 | **Must** | Gültige Koordinaten | Koordinaten müssen innerhalb des Schweizer Bounding Box liegen (WGS84: 5.95°–10.49° E, 45.82°–47.81° N). |
| I-087 | Should | Objekt innerhalb Standort | Warnung wenn ein Objekt (Baum, Grünfläche) ausserhalb des zugeordneten Standortperimeters liegt. |
| I-088 | Should | Überlappungsprüfung | Warnung bei signifikanter Überlappung zweier Grünflächen innerhalb desselben Standorts. |
| I-089 | Should | Minimum-Fläche/-Länge | Warnung bei unrealistisch kleinen Polygonen (<1 m²) oder kurzen Linien (<0.5 m). |
| I-090 | Could | Winding Order | Automatische Korrektur der Umlaufrichtung (äusserer Ring gegen Uhrzeigersinn, innerer Ring im Uhrzeigersinn) gemäss RFC 7946. |

### 3.3 Attributverwaltung

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| I-020 | **Must** | Attributformulare | Konfigurierbare Erfassungsformulare pro Objekttyp mit Pflichtfeldern, Dropdown-Listen und Validierung. |
| I-021 | **Must** | Massenbearbeitung | Änderung von Attributen für mehrere selektierte Objekte gleichzeitig. |
| I-022 | Should | Fotodokumentation | Verknüpfung von Fotos mit Objekten, inkl. Aufnahmedatum und georeferenzierter Zuordnung. |
| I-023 | Should | Dokumentenanhänge | Upload und Verknüpfung von Dokumenten (PDF, Pläne) mit Objekten. |
| I-024 | Could | Benutzerdefinierte Felder | Administratoren können zusätzliche Attributfelder pro Objekttyp anlegen ohne Codeanpassung. |

### 3.4 Artenverwaltung & Taxonomie

Verwaltung von Artendaten für Bäume und Bepflanzungen mit standardisierter Taxonomie, Neophyten-Klassifikation und Referenzdaten für Ökosystemleistungen. Die Struktur orientiert sich am Darwin-Core-Standard (TDWG) und den Schweizer Artendatenbanken (Infoflora, GALK Strassenbaumliste).

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| I-100 | **Must** | Artenreferenz-Datenbank | Zentrale Artendatenbank mit mehrstufiger Taxonomie: Gattung (genus), Art (species), Sorte (cultivar), deutscher Trivialname, französischer Trivialname. Basierend auf der Nomenklatur von Infoflora / GALK Strassenbaumliste. |
| I-101 | **Must** | Neophyten-Klassifikation | Klassifikation jeder Art gemäss Darwin Core `establishmentMeans`: einheimisch (native), eingeführt (introduced), eingebürgert (naturalised), invasiv (invasive), gepflegt (managed). Verknüpfung mit Infoflora Schwarze Liste / Watch List. |
| I-102 | Should | Arten-Autovervollständigung | Bei der Baumerfassung: Autovervollständigung der Artbezeichnung mit Vorschlag von Gattung, Art und Trivialname aus der Referenzdatenbank. |
| I-103 | Should | Artenstatistik | Dashboard mit Artenverteilung: Anzahl Bäume pro Gattung/Art, Anteil einheimischer vs. nicht-einheimischer Arten, häufigste Arten, Diversitätsindex. |
| I-104 | **Must** | i-Tree-Artenparameter | Hinterlegung der i-Tree-Eco-Koeffizienten pro Art (Wachstumsrate, Biomasse-Allometrie, Blattflächen-Index) für die Berechnung von Ökosystemleistungen. Basierend auf den für Schweizer Verhältnisse kalibrierten Koeffizienten (Basel, Bern, Zürich). |

### 3.5 Zustandserfassung & Inspektion

Strukturierte Workflows für die Zustandsbeurteilung von Bäumen, Grünflächen und Mobiliar. Die Baumkontrolle folgt der FLL-Baumkontrollrichtlinie (VTA-Protokoll); Spielplatzinspektionen orientieren sich an DIN EN 1176/1177. Die Inspektionsdaten bilden die Grundlage für dringlichkeitsbasierte Massnahmengenerierung.

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| I-110 | **Must** | Baumkontrolle nach VTA | Bauminspektion gemäss FLL-Baumkontrollrichtlinie mit Visual Tree Assessment (VTA): Dokumentation von Schäden in den standardisierten Zonen Wurzel, Stammfuss, Stamm, Krone und Äste. Einstufung der Dringlichkeit. |
| I-111 | **Must** | Zustandsnoten-System | Standardisiertes Zustandsbewertungssystem (1–5 Skala) für alle Inventarobjekte: 1 = sehr gut, 2 = gut, 3 = befriedigend, 4 = mangelhaft, 5 = ungenügend/Sofortmassnahme. Konsistent über Bäume, Grünflächen und Mobiliar. |
| I-112 | **Must** | Inspektionsplanung | Automatische Fälligkeitsberechnung der nächsten Inspektion basierend auf konfigurierbaren Intervallen pro Objekttyp und Risikoklasse. Erinnerungen und Übersicht fälliger Inspektionen. |
| I-113 | Should | Schadenszonen-Dokumentation | Detaillierte Erfassung von Schäden pro VTA-Zone (Wurzel, Stammfuss, Stamm, Krone, Äste) mit Schadensart, Schweregrad, Foto und Massnahmenempfehlung. |
| I-114 | Should | Spielplatzinspektion | Inspektionsworkflow für Spielplatzgeräte gemäss DIN EN 1176/1177 mit Sicherheitsprüfung, Mängelkatalog und Fotodokumentation. |
| I-115 | Should | Inspektionshistorie | Vollständige Versionierung aller Inspektionsergebnisse pro Objekt mit Zeitstempel, Kontrolleur, Zustandsnote und Trendvisualisierung (Verschlechterung/Verbesserung über Zeit). |
| I-116 | Should | Dringlichkeitsbasierte Massnahmengenerierung | Automatische Erstellung von Massnahmen (Tasks) basierend auf Inspektionsergebnissen: kritische Befunde erzeugen sofortige Massnahmen, mittlere Befunde werden in die nächste Pflegeperiode eingeplant. |
| I-117 | Should | Mobile Inspektion | Optimierte Inspektionsformulare für mobile Geräte (Tablet/Smartphone) mit Offline-Fähigkeit, GPS-Verortung und Kamera-Integration für die Felddokumentation. |

---

## 4. Pflegeprofil-Bibliothek

Die Pflegeprofil-Bibliothek ist ein zentrales Katalogsystem, das standardisierte Pflegeanweisungen verwaltet. Die Struktur orientiert sich am Profilkatalog «Mehr als Grün» der Stadt Zürich (ZHAW/GSZ 2019). Profile werden Grünflächen-Polygonen zugeordnet und steuern die automatische Generierung von Pflegemassnahmen.

### 4.1 Profilkategorien (basierend auf GSZ-Profilkatalog)

Das System wird mit folgenden vorkonfigurierten Profilkategorien ausgeliefert. Alle Profile sind editierbar und erweiterbar.

| Kategorie | Profile |
|-----------|---------|
| **Rasen & Wiesen** | Gebrauchsrasen, Blumenrasen, Blumenwiese, Schotterrasen |
| **Bepflanzungen** | Beetrosen, Bodendecker, Moorbeet, Ruderalvegetation, Staudenbepflanzung, Hochstaudenflur, Wechselflor |
| **Gehölze** | Strauchbepflanzung, Formhecken, Wildhecken |
| **Bäume** | Parkbaum, Strassenbaum, Obstbaum |
| **Spezialflächen** | Vertikalbegrünung, Dachbegrünung extensiv |
| **Strukturelemente** | Trockenmauer, Asthaufen, Steinhaufen, Nisthilfen |
| **Beläge** | Chaussierung, Stabilizer, Asphalt/Ortbeton, Pflasterung/Plattenbeläge, Klinker, Fallschutz lose |
| **Gewässer** | Gewässer ruhend, Gewässer fliessend, Brunnen/Wasserbecken/Planschbecken |
| **Nutzungsflächen** | Spielanlagen, Nutzgarten |

### 4.2 Profil-Datenstruktur

Jedes Pflegeprofil enthält folgende Datenstruktur (abgeleitet aus dem GSZ-Profilkatalog):

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| P-001 | **Must** | Profil-Stammdaten | Name, Profilcode (z.B. «GR» für Gebrauchsrasen), Kategorie, Kurzbeschreibung, Referenzbild. |
| P-002 | **Must** | Grundsätze naturnahe Pflege | Freitext-Feld mit den Grundsätzen der naturnahen Pflege für dieses Profil (z.B. «Reduktion der Schnittfrequenz», «Verzicht auf Herbizid-Einsatz»). |
| P-003 | **Must** | Massnahmen-Tabelle | Strukturierte Erfassung der Pflegemassnahmen mit den Feldern: Massnahme, Bemerkung, Zeitpunkt (Monat), Intervall (x pro Jahr), Material/Maschinen. |
| P-004 | **Must** | Spannungsfeld-Bewertung | Bewertung des Profils im Spannungsfeld Ökologie – Gestaltung – Nutzung (je als Slider oder Dreieck-Darstellung), differenziert nach «naturnaher Pflege» vs. «konventioneller Pflege». |
| P-005 | **Must** | Zuordnung zu Polygonen | n:m-Beziehung zwischen Profilen und Grünflächen-Polygonen. Ein Polygon kann mehrere Profile haben, ein Profil wird mehreren Polygonen zugeordnet. |
| P-006 | Should | Farbcodierung & Kartensymbolik | Jedes Profil hat eine definierte Farbe und ein Symbol für die Darstellung auf dem Pflegeübersichtsplan (analog GSZ-Pflegeübersichtsplan). |
| P-007 | Should | Qualitätsstufen | Pro Profil: Definition von «naturnaher Pflege» (Soll) vs. «konventioneller Pflege» (Vergleich) mit je einer Liste von Massnahmen und erwarteten Qualitäten. |
| P-008 | Should | Saisonaler Kalender | Jahreskalender (12 Monate) mit farblicher Darstellung, wann welche Massnahmen durchzuführen sind (analog GSZ-Jahrespflegeplaner). |
| P-009 | Should | Material-/Maschinenreferenz | Verknüpfung der Massnahmen mit einem Katalog von Maschinen und Materialien (z.B. Balkenmäher, Sense, organischer Dünger, Rechen). |
| P-010 | Could | Ökologische Indikatoren | Optionale Erfassung von Biodiversitäts-Indikatoren: Artenvielfalt (Flora/Fauna), Ressourcenverbrauch, Versiegelungsgrad. |

### 4.3 Profilverwaltung

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| P-020 | **Must** | CRUD-Operationen | Erstellen, Bearbeiten, Duplizieren und Löschen von Pflegeprofilen mit Berechtigungsprüfung. |
| P-021 | **Must** | GSZ-Standardprofile | Das System wird mit den 31 Profilen aus dem GSZ-Profilkatalog als editierbare Vorlagen ausgeliefert. |
| P-022 | Should | Versionshistorie | Änderungsverfolgung: wer hat wann welche Änderungen vorgenommen. |
| P-023 | Should | Import/Export | Import und Export von Pflegeprofilen als JSON/CSV für den Austausch zwischen Instanzen. |
| P-024 | Should | Profil-Vergleich | Nebeneinanderstellung von zwei Profilen zum visuellen Vergleich (naturnahe vs. konventionelle Pflege oder zwei unterschiedliche Profile). |
| P-025 | Could | Profil-Vererbung | Hierarchische Vererbung: Sub-Profile erben vom Eltern-Profil und überschreiben nur Abweichungen. |

### 4.4 Pflegeübersichtsplan

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| P-030 | **Must** | Automatische Generierung | Automatische Generierung eines Pflegeübersichtsplans pro Objekt/Perimeter auf Basis der zugeordneten Profile und deren Farbcodierung. |
| P-031 | Should | Profilcode-Beschriftung | Anzeige des Profilcodes und optionaler Nummerierung (bei unterschiedlicher Pflege gleicher Profile) direkt auf der Karte. |
| P-032 | Should | PDF-Export Pflegeübersichtsplan | Export des Pflegeübersichtsplans als druckfähiges PDF (A3/A4) mit Legende, Massstab und Nordpfeil. |
| P-033 | Could | Schraffur-Differenzierung | Unterschiedliche Schraffuren für Teilflächen desselben Profils, wenn unterschiedliche Pflegemassnahmen angewandt werden (analog GSZ). |

---

## 5. Massnahmenplanung & Task Management

Dieses Modul verknüpft Pflegeprofile mit konkreten Aufgaben, Terminen und Zuständigkeiten. Es ermöglicht die operative Steuerung der Grünflächenpflege und referenziert direkt die Massnahmen-Tabellen aus den zugeordneten Pflegeprofilen.

### 5.1 Massnahmen

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| M-001 | **Must** | Massnahmen erfassen | Erstellen von Massnahmen mit: Titel, Beschreibung, Typ (Pflege, Neubau, Sanierung, Inspektion, Neophytenbekämpfung), Priorität, Fälligkeitsdatum. |
| M-002 | **Must** | Räumliche Verknüpfung | Jede Massnahme ist mit einem oder mehreren Kartenobjekten verknüpft und auf der Karte visualisierbar. |
| M-003 | **Must** | Statusverfolgung | Workflow-basierter Status: Geplant → In Bearbeitung → Abgeschlossen → Abgenommen. Mit Zeitstempeln und Benutzerprotokoll. |
| M-004 | Should | Automatische Generierung | Automatische Erstellung wiederkehrender Massnahmen basierend auf den Massnahmen-Tabellen der zugeordneten Pflegeprofile (Zeitpunkt, Intervall). Analog zum GSZ-Jahrespflegeplaner. |
| M-005 | Should | Massnahmen-Kalender | Kalenderansicht (Monat, Woche, Tag) aller geplanten und fälligen Massnahmen mit Filtermöglichkeiten. |
| M-006 | Should | Jahrespflegeplaner-Ansicht | Tabellarische Jahresübersicht aller Massnahmen pro Objekt (Zeilen: Massnahmen, Spalten: Monate) — digitale Version des GSZ-Jahrespflegeplaners. |
| M-007 | Should | Massnahmentyp «Neophytenbekämpfung» | Dedizierter Massnahmentyp für invasive Neophyten mit Feldern: Art, Bekämpfungsmethode, Sicherheitsmassnahmen, Entsorgungsart (gemäss GSZ-Richtlinien und Infoflora). |
| M-008 | Could | Abhängigkeiten | Definition von Abhängigkeiten zwischen Massnahmen (z.B. Bodenvorbereitung vor Neupflanzung). |

### 5.2 Aufgabenverwaltung

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| M-010 | **Must** | Aufgaben zuweisen | Zuweisung von Massnahmen an interne Mitarbeitende oder externe Kontakte (Unternehmer, Gärtner). |
| M-011 | Should | Benachrichtigungen | E-Mail- oder In-App-Benachrichtigungen bei Zuweisung, Fälligkeit und Statusänderungen. |
| M-012 | Should | Checklisten | Jede Massnahme kann eine Checkliste mit Teilaufgaben enthalten (z.B. Mähen, Düngen, Bewässern). |
| M-013 | Should | Zeiterfassung | Erfassung des tatsächlichen Aufwands pro Massnahme in Stunden. |
| M-014 | Should | Material-/Maschinenprotokoll | Erfassung der effektiv eingesetzten Maschinen und Materialien pro Massnahme (Soll/Ist-Vergleich mit Profilvorgabe). |
| M-015 | Could | Gantt-Darstellung | Darstellung der Massnahmenplanung als Gantt-Diagramm mit Drag-and-Drop-Anpassung. |

---

## 6. Mobile Erfassung (Field Survey)

Mobiles Modul für die Datenerfassung, Zustandsbeurteilung und Massnahmen-Rückmeldung direkt im Feld. Optimiert für Tablets und Smartphones.

### 6.1 Mobile Applikation

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| MO-001 | **Must** | PWA oder native App | Bereitstellung als Progressive Web App (bevorzugt) oder native App (iOS/Android), optimiert für Tablet-Nutzung im Feld. |
| MO-002 | **Must** | Mobile Karte | Vollwertige Kartenansicht auf mobilen Geräten mit Touch-Navigation, GPS-Ortung und Anzeige aller relevanten Layer. |
| MO-003 | **Must** | GPS-Verortung | Automatische Positionsbestimmung des Nutzers auf der Karte. Möglichkeit, den aktuellen Standort als Punkt zu setzen oder einem Objekt zuzuordnen. |
| MO-004 | **Must** | Objekt-Identifikation | Antippen eines Objekts auf der Karte zeigt alle Attribute, zugeordnete Pflegeprofile und offene Massnahmen an. |
| MO-005 | **Must** | Massnahmen-Rückmeldung | Abschlussmeldung offener Massnahmen mit: Status-Update, Zeitaufwand, Bemerkung, Foto. |

### 6.2 Felderfassung

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| MO-010 | **Must** | Foto-Erfassung | Aufnahme von Fotos direkt über die Kamera mit automatischer Georeferenzierung (EXIF-GPS) und Zuordnung zum selektierten Objekt. |
| MO-011 | Should | Zustandsbeurteilung | Strukturiertes Formular zur Zustandsbeurteilung von Grünflächen und Bäumen im Feld (Zustandsnote, Schäden, Massnahmenbedarf). |
| MO-012 | Should | Baum-Ersterfassung | Schnellerfassung neuer Bäume: GPS-Punkt setzen, Foto, Baumart (mit Autovervollständigung), Stammumfang, Kronendurchmesser. |
| MO-013 | Should | Neophyten-Meldung | Schnellerfassung von Neophyten-Funden: GPS-Punkt, Foto, Art (Dropdown mit häufigen invasiven Arten gemäss Infoflora Schwarze Liste), geschätzte Fläche, Dringlichkeit. |
| MO-014 | Should | Profil-Profilblatt anzeigen | Anzeige des Praxishandbuch-Profilblatts (Doppelseite) für das zugeordnete Profil direkt auf dem mobilen Gerät — als Referenz für das Pflegepersonal im Feld. |

### 6.3 Offline-Fähigkeit

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| MO-020 | Should | Offline-Kartenkacheln | Download von Kartenausschnitten (Basiskarte + Fachdaten) für die Nutzung ohne Internetverbindung. |
| MO-021 | Should | Offline-Datenerfassung | Erfassung von Fotos, Zustandsbeurteilungen und Massnahmen-Rückmeldungen im Offline-Modus mit automatischer Synchronisation bei Wiederherstellung der Verbindung. |
| MO-022 | Should | Konflikt-Handling | Bei gleichzeitiger Bearbeitung desselben Objekts durch mehrere Benutzer: automatische Erkennung und Dialog zur Konfliktlösung bei Synchronisation. |
| MO-023 | Could | Offline-Pflegeprofile | Lokaler Cache aller zugeordneten Pflegeprofil-Profilblätter für die Nutzung ohne Verbindung. |

---

## 7. Kontaktmanagement

Verwaltung aller internen und externen Ansprechpersonen mit Verknüpfung zu Grünflächen, Massnahmen und Verträgen.

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| C-001 | **Must** | Kontaktverzeichnis | Zentrale Verwaltung von Kontakten: Name, Organisation, Rolle, Adresse, Telefon, E-Mail. |
| C-002 | **Must** | Kontakttypen | Unterscheidung zwischen internen Mitarbeitenden, externen Unternehmern (Gartenbau), Behörden und Lieferanten. |
| C-003 | **Must** | Verknüpfung mit Objekten | Zuordnung von Kontakten zu Grünflächen (z.B. Zuständige/r), Massnahmen und Verträgen. |
| C-004 | Should | Vertragsübersicht | Verwaltung von Pflegeverträgen mit Laufzeiten, Konditionen und automatischer Erinnerung vor Ablauf. |
| C-005 | Should | Kontakthistorie | Chronologische Dokumentation der Kommunikation und Aktivitäten pro Kontakt. |
| C-006 | Could | LDAP/AD-Integration | Anbindung an bestehendes Verzeichnissystem für interne Mitarbeitende. |

---

## 8. Kosten, Budget & Prognosen

Finanzielle Planung und Überwachung der Grünflächenbewirtschaftung, von der Einzelmassnahme bis zur Portfolioübersicht.

### 8.1 Kostenerfassung

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| F-001 | **Must** | Kosten pro Massnahme | Erfassung von Ist-Kosten (Material, Personal, Fremdleistungen) pro Massnahme. |
| F-002 | **Must** | Kosten pro Fläche | Aggregation der Kosten pro Grünfläche über alle zugehörigen Massnahmen und Zeiträume. |
| F-003 | Should | Budgetplanung | Jahresbudget pro Grünfläche, Bereich oder Gesamtportfolio mit Soll/Ist-Vergleich. |
| F-004 | Should | Kostenstellen-Zuordnung | Zuordnung von Kosten zu organisatorischen Kostenstellen. |
| F-005 | Should | Profil-basierte Kostenschätzung | Automatische Kostenschätzung auf Basis der zugeordneten Pflegeprofile, Flächengrössen und hinterlegter Einheitspreise (CHF/m²/Jahr pro Profiltyp). |

### 8.2 Prognosen und Berichte

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| F-010 | Should | Kostenprognose | Hochrechnung der erwarteten Jahreskosten basierend auf Pflegeprofilen, Flächengrössen und historischen Daten. |
| F-011 | Should | Dashboard / KPI | Dashboard mit Kennzahlen: Gesamtfläche nach Profiltyp, Kosten/m², offene Massnahmen, Budget-Auslastung, Anteil naturnaher Pflege. |
| F-012 | Should | Berichtsexport | Export von Kosten- und Massnahmenberichten als PDF oder CSV. |
| F-013 | Could | Trendsanalyse | Mehrjährige Kostenentwicklung pro Fläche oder Pflegeprofil mit grafischer Darstellung. |
| F-014 | Could | Szenarien-Vergleich | Vergleich verschiedener Pflegeszenarien (z.B. «naturnahe Pflege» vs. «konventionelle Pflege» gemäss GSZ-Systematik) hinsichtlich Kosten, Aufwand und ökologischem Nutzen. |

### 8.3 Ökosystemleistungen

Berechnung und Darstellung der Ökosystemleistungen von Bäumen und Grünflächen basierend auf den i-Tree-Eco-Methoden und den für Schweizer Verhältnisse kalibrierten Koeffizienten (Pilotstädte Basel, Bern, Zürich, Lausanne, Luzern, Winterthur).

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| F-020 | Should | CO₂-Sequestrierung | Berechnung der jährlichen CO₂-Bindung (kg/Jahr) und des gespeicherten CO₂ (kg total) pro Baum basierend auf Art, Stammumfang und Wachstumsrate (i-Tree-Eco-Methodik). |
| F-021 | Should | Regenwasserrückhalt | Schätzung der jährlichen Regenwasserrückhaltung (m³/Jahr) pro Baum und Grünfläche basierend auf Kronenfläche und Blattflächen-Index. |
| F-022 | Should | Kronendachmonitoring | Erfassung und Tracking des Kronendach-Bedeckungsgrads (%) pro Standort über die Zeit. Unterstützung der EU-NRR-Baseline-Anforderung (kein Nettoverlust der Baumkronenfläche). |
| F-023 | Could | Ökosystemleistungs-Dashboard | Aggregierte Darstellung aller Ökosystemleistungen pro Standort oder Portfolio: CO₂-Bilanz, Regenwasserrückhalt, Luftschadstoff-Filterung, Kühlungseffekt. |
| F-024 | Could | Baumwert-Berechnung | Berechnung des Baumwerts (CHF) nach der Stammformel-Methode (VSSG/FLL) oder CTLA-Methode für Versicherungs- und Planungszwecke. |

---

## 9. Datenimport & -export

Integration externer Datenquellen und Austauschformate für CAD-Grundrisse, BIM-Modelle und GIS-Daten.

### 9.1 GIS-Datenformate

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| D-001 | **Must** | Shapefile Import/Export | Import und Export von ESRI Shapefiles (.shp/.dbf/.shx/.prj). |
| D-002 | **Must** | GeoJSON Import/Export | Import und Export von GeoJSON-Dateien. |
| D-003 | Should | GeoPackage | Unterstützung von OGC GeoPackage (.gpkg) als modernes Austauschformat. |
| D-004 | Should | KML/KMZ | Import von KML/KMZ-Dateien (z.B. aus Google Earth). |
| D-005 | Could | WFS-T (Transactional) | Bidirektionaler Datenaustausch über WFS-T für Echtzeit-Synchronisation mit externen GIS. |

### 9.2 CAD-Import

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| D-010 | **Must** | DXF/DWG-Import | Import von CAD-Grundrissen im DXF- und DWG-Format mit Layer-Zuordnung und Georeferenzierung. |
| D-011 | Should | CAD-Layer-Mapping | Dialoggestütztes Mapping von CAD-Layern auf GIS-Layer bei Import. |
| D-012 | Should | Georeferenzierung | Werkzeug zur manuellen Georeferenzierung importierter CAD-Pläne (Referenzpunkte setzen). |
| D-013 | Could | PDF-Plan-Import | Import georeferenzierter PDF-Pläne als Rasterlayer. |

### 9.3 BIM-Integration

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| D-020 | Should | IFC-Import | Import von IFC-Dateien mit Extraktion relevanter Geometrien (IfcSite, Gelände, Aussenanlagen). |
| D-021 | Should | BIM-Attribut-Mapping | Übernahme von BIM-Attributen (Materialien, Flächen, Bepflanzungstypen) in das Inventar. |
| D-022 | Could | IFC-Viewer | Integrierter 3D-Viewer für importierte IFC-Modelle mit Querverweis zum GIS-Inventar. |
| D-023 | Could | BCF-Integration | Unterstützung von BIM Collaboration Format (BCF) für koordinierte Mängel-/Aufgabenverwaltung. |
| D-024 | Won't | Live-BIM-Synchronisation | Echtzeit-Synchronisation mit einer CDE (Common Data Environment). Für spätere Releases vorgemerkt. |

### 9.4 Moderne Datenschnittstellen & Interoperabilität

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| D-030 | Should | GeoPackage Import/Export | Unterstützung von OGC GeoPackage (.gpkg) als Offline-Austauschformat für mobile Datenerfassung und QGIS-Integration. |
| D-031 | Should | OGC API Features | REST-basierte Geodatenschnittstelle gemäss OGC API Features (Nachfolger von WFS) für die Interoperabilität mit kantonalen GIS, QGIS-Arbeitsplätzen und Bundesreporting. |
| D-032 | Could | DCAT-AP CH Metadaten | Export von DCAT-AP-CH-2.0-konformen Metadatensätzen für die Publikation auf opendata.swiss und der I14Y-Interoperabilitätsplattform. |
| D-033 | Could | Darwin Core / GBIF Export | Export von Baumdaten als Darwin-Core-Occurrence-Records für die Meldung an GBIF / Infoflora und nationale Biodiversitätsmonitorings. |
| D-034 | Could | Schema.org JSON-LD Export | Export von Standortdaten als Schema.org `Park`-Objekte im JSON-LD-Format für öffentliche Auffindbarkeit und Suchmaschinen-Integration. |

---

## 10. Suche, Filter & Selektion

Effizientes Auffinden und Selektieren von Objekten über räumliche und attributbasierte Kriterien.

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| S-001 | **Must** | Volltextsuche | Globale Suche über alle Objekte, Massnahmen und Kontakte mit Auto-Suggest. |
| S-002 | **Must** | Attributfilter | Filterung der Kartenobjekte nach beliebigen Attributkombinationen (Profiltyp, Zustand, Zuständigkeit etc.). |
| S-003 | **Must** | Räumliche Selektion | Auswahl von Objekten per Klick, Rechteck-Selektion, Polygon-Selektion oder Puffer. |
| S-004 | Should | Gespeicherte Filter | Speicherung häufig verwendeter Filterkombinationen als benannte Ansichten. |
| S-005 | Should | Ergebnisliste & Karte synchron | Selektierte Objekte werden sowohl in einer Listenansicht als auch auf der Karte hervorgehoben. |
| S-006 | Could | Räumliche Abfragen | SQL-ähnliche räumliche Abfragen (z.B. «alle Bäume innerhalb von 50m einer Strasse»). |

---

## 11. Benutzerverwaltung & Berechtigungen

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| U-001 | **Must** | Benutzeranmeldung | Sichere Authentifizierung mit Benutzername/Passwort oder SSO (SAML/OIDC). |
| U-002 | **Must** | Rollenbasierte Zugriffskontrolle | Mindestens folgende Rollen: Administrator, Planer, Erfasser (Feld), Betrachter. Rollen steuern Lese-/Schreib-/Löschrechte. |
| U-003 | Should | Räumliche Berechtigungen | Einschränkung des Zugriffs auf bestimmte geographische Bereiche (z.B. nur eigene Gemeinde/Region). |
| U-004 | Should | Audit-Log | Protokollierung aller sicherheitsrelevanten Aktionen (Login, Datenänderungen, Löschungen). |
| U-005 | Could | Zwei-Faktor-Authentifizierung | Optionale 2FA für erhöhte Sicherheit. |

---

## 12. Nicht-funktionale Anforderungen

### 12.1 Performance & Skalierbarkeit

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| N-001 | **Must** | Kartenladezeit | Die Kartenansicht muss innerhalb von 3 Sekunden vollständig geladen sein (bei Standard-Internetverbindung). |
| N-002 | **Must** | Datenvolumen | Das System muss mindestens 100'000 Polygone und 500'000 Punktobjekte performant verwalten können. |
| N-003 | Should | Gleichzeitige Benutzer | Mindestens 50 gleichzeitige Benutzer ohne spürbare Performance-Einbussen. |
| N-004 | Should | Caching | Intelligentes Caching von Kartenkacheln und häufig abgerufenen Daten. |

### 12.2 Technische Architektur

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| N-010 | **Must** | Webbasiert | Die Anwendung läuft vollständig im Browser (Chrome, Firefox, Edge, Safari) ohne Plugins. |
| N-011 | **Must** | Responsive Design | Die Anwendung ist auf Desktop optimiert, mit angepasster Ansicht für Tablets (Field Survey). |
| N-012 | Should | REST-API | Offene REST-API für die Integration mit Drittsystemen und für Automatisierungen. |
| N-013 | Should | Datenbank | Verwendung einer räumlichen Datenbank (z.B. PostGIS) als Backend. |
| N-014 | Should | PWA-Unterstützung | Progressive Web App mit Service Worker für Offline-Fähigkeit und Home-Screen-Installation. |

### 12.3 Betrieb & Wartung

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| N-020 | **Must** | Backup & Recovery | Automatisierte tägliche Backups mit dokumentiertem Wiederherstellungsprozess. |
| N-021 | **Must** | Datenschutz | Konformität mit DSG (Schweizer Datenschutzgesetz). Daten werden in der Schweiz gehostet. |
| N-022 | Should | Monitoring | System-Monitoring mit Alerting bei Ausfällen oder Performance-Problemen. |
| N-023 | Should | Dokumentation | Technische Dokumentation (Architektur, API) und Benutzerhandbuch. |
| N-024 | Should | Staging-Umgebung | Separate Test-/Staging-Umgebung für Updates und QA vor dem Produktivgang. |

### 12.4 Standards & Interoperabilität

| ID | Prio | Anforderung | Beschreibung |
|----|------|-------------|--------------|
| N-030 | Should | EU-NRR-Baseline-Tracking | Unterstützung der temporalen Versionierung (validFrom/validUntil) für die Berechnung von «kein Nettoverlust»-Metriken gemäss EU Nature Restoration Regulation (2024/1991). Aggregierte Kennzahlen (Gesamtgrünfläche, Kronendach-Bedeckungsgrad) pro Standort und Gemeinde. |
| N-031 | Should | Open-Data-Publikationsbereitschaft | Datenmodell und Export-Funktionen unterstützen die Publikation als offene Daten auf opendata.swiss (DCAT-AP CH, maschinenlesbare Formate, standardisierte Metadaten). |
| N-032 | Could | CityGML-3.0-Kompatibilität | Optionale Metadatenfelder (`cityGmlClass`) auf räumlichen Entitäten für die Interoperabilität mit kantonalen und nationalen 3D-Stadtmodellen (z.B. swisstopo swissTLM3D). |
| N-033 | Could | INSPIRE-Ausrichtung | Ausrichtung der Bodenbedeckungs-/Nutzungsklassifikation an INSPIRE Land Cover / Land Use für europaweite Vergleichbarkeit. Basierend auf der bestehenden DMAV-Bodenbedeckungsart-Zuordnung. |

---

## 13. Zusammenfassung der Anforderungen

### Übersicht nach Priorität

| Modul | Must | Should | Could | Won't | Total |
|-------|------|--------|-------|-------|-------|
| 2. Kartenmodul | 8 | 6 | 4 | 0 | 18 |
| 3. Inventarmodul (inkl. Arten & Inspektion) | 35 | 33 | 6 | 0 | 74 |
| 4. Pflegeprofil-Bibliothek | 7 | 7 | 2 | 0 | 16 |
| 5. Massnahmenplanung | 4 | 7 | 2 | 0 | 13 |
| 6. Mobile Erfassung | 6 | 6 | 1 | 0 | 13 |
| 7. Kontaktmanagement | 3 | 2 | 1 | 0 | 6 |
| 8. Kosten, Prognosen & Ökosystemleistungen | 2 | 8 | 4 | 0 | 14 |
| 9. Datenimport/-export (inkl. moderne Schnittstellen) | 2 | 7 | 7 | 1 | 17 |
| 10. Suche & Filter | 3 | 2 | 1 | 0 | 6 |
| 11. Benutzerverwaltung | 2 | 2 | 1 | 0 | 5 |
| 12. Nicht-funktionale Anf. (inkl. Standards) | 5 | 9 | 2 | 0 | 16 |
| **Total** | **77** | **89** | **31** | **1** | **198** |

---

## Anhang

### A. Offene Punkte

- [ ] Abgrenzung der Pilotphase: welche Module werden zuerst umgesetzt?
- [ ] Hosting-Modell: On-Premise vs. Cloud (Swiss Cloud Provider)?
- [ ] Integration mit bestehenden Fachsystemen (z.B. SAP PM, GEVER)?
- [ ] Lizenzklärung der GSZ-Profilkatalog-Inhalte für die Verwendung als Standardprofile
- [ ] Definition der Datenmigrationsstrategie für bestehende Inventardaten
- [ ] Entscheid PWA vs. native App für das Mobile-Modul
- [ ] Technologie-Stack-Entscheid (Frontend-Framework, Karten-Library, Backend)
- [ ] Einbindung weiterer Referenzwerke (SIA-Normen, VSSG-Richtlinien) in die Profil-Bibliothek
- [ ] Klärung der Anforderungen an Winterdienst-Massnahmen (Streumittel-Tracking)
- [ ] Anforderungen an Beleuchtungs-Management (Lichtverschmutzung gemäss SIA 491)
- [ ] VTA-Inspektionskatalog: Definition des standardisierten Schadens- und Massnahmenkatalogs für die Baumkontrolle (FLL-Baumkontrollrichtlinie)
- [ ] i-Tree-Koeffizienten: Beschaffung/Validierung der für Schweizer Verhältnisse kalibrierten i-Tree-Eco-Artparameter (Pilotstädte)
- [ ] Artenreferenzdatenbank: Aufbau/Import einer vollständigen Artenreferenztabelle (Infoflora, GALK Strassenbaumliste)
- [ ] EU NRR: Klärung der indirekten Anwendbarkeit der EU Nature Restoration Regulation (2024/1991) auf die Schweiz (BAFU-Positionierung)
- [ ] Open-Data-Strategie: Definition der zu publizierenden Datensätze, Lizenzbedingungen und Aktualisierungsrhythmus für opendata.swiss
- [ ] Grünstadt Schweiz: Abstimmung der Reporting-Outputs auf die Anforderungen des VSSG-Qualitätslabels

### B. Referenzen

| Quelle | Titel | Jahr |
|--------|-------|------|
| ZHAW / Grün Stadt Zürich | Profilkatalog naturnahe Pflege «Mehr als Grün» | 2019 |
| ZHAW / Grün Stadt Zürich | Praxishandbuch naturnahe Pflege «Mehr als Grün» | 2019 |
| Stadt Zürich | VVO über die naturnahe Pflege und Bewirtschaftung städtischer Grün- und Freiflächen | — |
| BAFU | Aktionsplan Strategie Biodiversität Schweiz | 2017 |
| SIA | SIA 491 – Vermeidung unnötiger Lichtemissionen im Aussenraum | 2013 |
| SIA | SIA 318:2009 – Garten- und Landschaftsbau | 2009 |
| FiBL | Betriebsmittelliste für den biologischen Landbau | fortlaufend |
| Infoflora | Schwarze Liste und Watch List invasiver Neophyten | fortlaufend |
| FLL | Baumkontrollrichtlinie – Richtlinie für Regelkontrollen zur Überprüfung der Verkehrssicherheit von Bäumen | 2020 |
| FLL | ZTV-Baumpflege – Zusätzliche Technische Vertragsbedingungen und Richtlinien für Baumpflege | 2017 |
| DIN | DIN 18919 – Vegetationstechnik: Pflege von Grünflächen | — |
| DIN | DIN EN 1176/1177 – Spielplatzgeräte und Spielplatzböden | — |
| OGC | CityGML 3.0 Conceptual Model Standard | 2024 |
| OGC | OGC API Features – Part 1: Core | 2019 |
| OGC | GeoPackage Encoding Standard | 2014 |
| European Commission | INSPIRE Data Specifications (Land Cover, Land Use, Protected Sites) | 2013 |
| European Parliament | Regulation (EU) 2024/1991 – Nature Restoration Regulation | 2024 |
| TDWG | Darwin Core Standard | fortlaufend |
| USDA Forest Service | i-Tree Eco – Urban Forestry Analysis | fortlaufend |
| VSSG | Grünstadt Schweiz® Qualitätslabel | fortlaufend |
| GALK | Strassenbaumliste – Empfohlene Strassenbäume für Mitteleuropa | fortlaufend |
| ISO | ISO 55000 – Asset Management (Überblick, Grundsätze, Terminologie) | 2014/2024 |
| DCAT-AP CH | Metadatenprofil für offene Daten auf opendata.swiss (I14Y) | 2.0 |

### C. Änderungshistorie

| Version | Datum | Änderung |
|---------|-------|----------|
| 0.1 | Februar 2026 | Erster Entwurf, 106 Anforderungen |
| 0.2 | Februar 2026 | Erweiterung um GSZ-Profilstruktur (31 Profile, Spannungsfeld Ökologie–Gestaltung–Nutzung, Massnahmen-Tabellen), Pflegeübersichtsplan-Modul, Mobile-Modul (Field Survey mit Offline-Fähigkeit), Neophyten-Erfassung, Jahrespflegeplaner-Ansicht, erweiterte Objekttypen (Strukturelemente, Beläge, Gewässer). 130 Anforderungen. |
| 0.3 | Februar 2026 | Umfassende Erweiterung des Geometrie-Editing-Moduls (Kap. 3.2): Aufgliederung nach Geometrietyp (Polygon, Punkt, Linie), neue Abschnitte für Selektion, Bearbeitungsworkflow, Zeichenhilfen und Geometrie-Validierung. +41 neue Anforderungen basierend auf Analyse von QGIS, ArcGIS Web Editor, Mapbox GL Draw und Leaflet-Geoman. Neu 171 Anforderungen. |
| 0.4 | Februar 2026 | Abgleich mit RESEARCH.md und DATAMODEL.md: Neue Abschnitte Artenverwaltung & Taxonomie (Kap. 3.4, Darwin Core, Infoflora, GALK), Zustandserfassung & Inspektion (Kap. 3.5, FLL-Baumkontrollrichtlinie, VTA, DIN EN 1176/1177), Ökosystemleistungen (Kap. 8.3, i-Tree Eco), Moderne Datenschnittstellen (Kap. 9.4, GeoPackage, OGC API Features, DCAT-AP CH, GBIF), Standards & Interoperabilität (Kap. 12.4, EU NRR, CityGML 3.0, INSPIRE). +27 neue Anforderungen. Erweiterte Referenzen und offene Punkte. Neu 198 Anforderungen. |
