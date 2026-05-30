# DataOrganizer - opis funkcjonalny do budowy podobnej aplikacji

## Cel produktu

Aplikacja jest panelem analitycznym dla e-commerce. Zbiera dane z wielu zrodel sprzedazy, marketingu i analityki, normalizuje je, pokazuje KPI w dashboardach oraz pozwala zadawac pytania asystentowi AI na podstawie danych firmy.

Produkt laczy trzy glowne obszary:

- Dashboard BI: gotowe widoki metryk, wykresow, tabel i porownan okresow.
- Integracje danych: podlaczanie kanalow sprzedazy, reklam i analityki.
- AI copilot: panel czatu, gotowe zadania analityczne i akcje typu "pokaz wykres", "wskaz mozliwosci wzrostu", "optymalizuj budzet".

Materialy zrzutow ekranu sa w folderze `dataorganizer-screenshots/`.

## Globalny uklad aplikacji

### Topbar

Staly niebieski pasek na gorze aplikacji.

Elementy:

- logo i nazwa produktu po lewej,
- selektor aktywnej firmy/workspace, np. `DEMO`,
- ikony akcji po prawej:
  - zarzadzanie kontem,
  - forum/pomoc,
  - uzytkownicy lub zaproszenia,
  - wiadomosci/powiadomienia,
  - wylogowanie.

Zachowanie:

- klikniecie selektora firmy otwiera dropdown z opcjami workspace,
- ikony w topbarze otwieraja male menu, panele boczne albo prowadza do widokow konta,
- topbar jest widoczny na wszystkich ekranach dashboardu.

### Sidebar

Stale pionowe menu po lewej stronie, z ikonami bez etykiet tekstowych.

Sekcje:

- Podsumowanie: `/pl/dashboard/podsumowanie`
- Zamowienia: `/pl/dashboard/zamowienia`
- Produkty: `/pl/dashboard/produkty`
- Klienci: `/pl/dashboard/klienci`
- Marketing: `/pl/dashboard/marketing`
- Ruch na stronie / Google Analytics: `/pl/dashboard/google-analytics`
- Integracje danych: `/pl/dashboard/integracje-danych`
- Ustawienia firmowe: `/pl/dashboard/ustawienia-firmowe`
- Subskrypcja: `/pl/dashboard/subskrypcja`

Zachowanie:

- aktywna sekcja jest podswietlona niebieskim tlem,
- ikony maja kompaktowy styl,
- nawigacja nie zmienia globalnych filtrow, jesli uzytkownik pozostaje w obszarze analitycznym.

### Globalne filtry dashboardow

Widoczne w sekcjach analitycznych.

Filtry:

- wybor kanalow/rynkow, np. `PL, UK`,
- zakres dat glownego okresu, np. `22.05.2026 - 28.05.2026`,
- zakres porownawczy `vs`, np. `15.05.2026 - 21.05.2026`,
- przycisk `Dostepnosc danych`.

Zachowanie:

- zmiana zakresu dat przelicza wszystkie karty KPI, wykresy, tabele i procentowe zmiany,
- zakres porownawczy zasila wartosci `vs poprzedni`,
- dropdown kanalow filtruje wyniki do wybranych rynkow lub kanalow,
- kalendarze dzialaja jako date range picker,
- przycisk `Dostepnosc danych` pokazuje, ktore integracje i zakresy danych sa aktywne.

## Wspolne komponenty analityczne

### Karty KPI

Karty pokazuja:

- nazwe metryki,
- wartosc glowna,
- walute lub jednostke,
- zmiane procentowa wzgledem okresu porownawczego,
- kolor statusu: zielony dla wzrostu, czerwony dla spadku, neutralny dla braku danych.

Przyklady:

- Przychod netto,
- Koszt calkowity,
- Zysk netto,
- Sprzedane sztuki,
- Rabat,
- Koszt mediow,
- Koszt produktu,
- Zamowienia,
- AOV,
- ROAS,
- CTR,
- CPC,
- CPM.

### Wykresy

Typy widoczne w aplikacji:

- wykres liniowy z wypelnieniem dla trendow w czasie,
- wykres porownawczy dwoch serii, np. przychod vs koszty,
- wykres slupkowy,
- wykres segmentowy/pie lub donut dla udzialow,
- lejek konwersji,
- tabele rankingowe z metrykami.

Wymagania:

- kazdy wykres powinien reagowac na globalne filtry,
- legenda z kolorami musi byc widoczna nad lub przy wykresie,
- tooltip po najechaniu powinien pokazywac date, wartosc, zmiane i serie,
- puste stany musza tlumaczyc, jakich danych brakuje.

### Tabele

Tabele sa uzywane do:

- top produktow,
- kampanii,
- kanalow,
- metod platnosci,
- dostaw,
- ruchu i zdarzen,
- transakcji,
- uzytkownikow.

Wspolny wzorzec:

- naglowek sekcji,
- kolumny metryk,
- sortowanie po metrykach,
- badge zmiany procentowej,
- identyfikatory obiektow, np. ID produktu,
- przewijanie tabeli przy duzej liczbie pozycji.

### Prawy panel AI

Na dashboardach widoczny jest prawy panel asystenta.

Elementy:

- naglowek `Nowa rozmowa`,
- menu z trzema kropkami,
- zamkniecie panelu,
- stan pusty z pytaniem typu "W czym moge Ci dzis pomoc?",
- pole tekstowe `Zapytaj, wyszukaj lub stworz cokolwiek`,
- upload pliku,
- gotowe kafelki z zadaniami,
- panel promocyjny z CTA `Zaloz konto i podlacz swoje dane`.

Funkcje:

- zadawanie pytan o dane,
- generowanie wykresow i tabel,
- sugerowanie optymalizacji,
- analiza kampanii,
- pokazywanie gotowych zadan zaleznosci od aktualnego widoku.

## Moduly aplikacji

## 1. Podsumowanie

URL: `/pl/dashboard/podsumowanie`

Cel: glowny ekran kondycji e-commerce.

Widoki i elementy:

- naglowek `Podsumowanie`,
- globalne filtry kanalow i dat,
- sekcja `Analiza w czasie`,
- przelaczniki:
  - `Przychod vs Koszty`,
  - `Zamowienia`,
  - `COS i Marza`,
- karty KPI:
  - Przychod netto,
  - Koszt calkowity,
  - Zysk netto,
- panel `Kluczowe wskazniki`:
  - Sprzedane sztuki,
  - Rabat,
  - Koszt mediow,
  - Koszt dodatkowy,
  - Koszt produktu,
  - Koszty marketplace,
- sekcja `Efektywnosc reklam`:
  - Wyswietlenia,
  - Klikniecia,
  - CPC,
  - CTR,
  - CPM,
  - ranking zrodel reklamowych,
- sekcja `Segmenty klientow`:
  - nowi klienci,
  - powracajacy klienci,
  - liczba klientow,
  - przychod,
  - sredni koszyk,
- tabela `Top produkty`,
- sekcja `Lejek zakupowy`,
- `Analiza kanalow sprzedazy` z podzialem np. PL/UK.

Akcje AI:

- `Sprawdz dostepne dane`,
- `Wskaz mozliwosci wzrostu`,
- `Pokaz tabele kampanii`,
- `Przegladaj gotowe zadania`.

## 2. Zamowienia

URL: `/pl/dashboard/zamowienia`

Cel: analiza sprzedazy, wartosci koszyka, platnosci, rabatow i dostaw.

Podzakladki:

- `Przeglad`,
- `Rabaty`,
- `Platnosci`,
- `Dostawa`.

Funkcje:

- analiza przychodow w czasie,
- liczba zamowien,
- srednia wartosc koszyka,
- koszty zwiazane z zamowieniami,
- marza i zysk,
- analiza rabatow,
- analiza metod platnosci,
- analiza metod dostawy,
- ranking produktow w zamowieniach.

Akcje AI:

- `Porownaj przychody vs koszty`,
- `Oblicz srednia wartosc koszyka`,
- `Pokaz tabele TOP produktow`,
- `Przegladaj gotowe zadania`.

Wymagane dane:

- zamowienia,
- pozycje zamowien,
- status zamowienia,
- data utworzenia,
- waluta,
- przychod brutto/netto,
- rabaty,
- podatki,
- koszt dostawy,
- metoda platnosci,
- metoda dostawy,
- kanal sprzedazy,
- klient,
- produkt.

## 3. Produkty

URL: `/pl/dashboard/produkty`

Cel: analiza asortymentu, cen, sprzedazy produktow i slow z nazw produktow.

Podzakladki:

- `Przeglad`,
- `Produkty`,
- `Ceny`,
- `Slowa z nazw produktow`.

Funkcje:

- ranking produktow wedlug przychodu,
- ranking produktow wedlug liczby sprzedanych sztuk,
- analiza marzy produktowej,
- analiza cen,
- wykrywanie produktow bez sprzedazy,
- analiza konwersji produktow,
- agregacja po slowach wystepujacych w nazwach produktow.

Akcje AI:

- `Pokaz wykres przychodow`,
- `Pokaz top konwertujace produkty`,
- `Znajdz produkty bez sprzedazy`,
- `Przegladaj gotowe zadania`.

Wymagane dane:

- katalog produktow,
- ID/SKU,
- nazwa,
- wariant,
- cena,
- koszt produktu,
- liczba sztuk sprzedanych,
- przychod,
- zwroty,
- rabaty,
- kanal sprzedazy,
- kategoria.

## 4. Klienci

URL: `/pl/dashboard/klienci`

Cel: analiza zachowan klientow, nowych i powracajacych klientow, retencji oraz CLV/LTV.

Podzakladki:

- `Przeglad`,
- `Produkty`,
- `LTV i Retencja`,
- `Czestotliwosc`.

Funkcje:

- podzial nowych i powracajacych klientow,
- liczba klientow,
- przychod z segmentow,
- sredni koszyk segmentow,
- retencja,
- LTV/CLV,
- czestotliwosc zakupow,
- produkty kupowane przez segmenty klientow.

Akcje AI:

- `Stworz wykres metod platnosci`,
- `Porownaj nowych vs powracajacych`,
- `Oblicz CLV segmentow klientow`,
- `Przegladaj gotowe zadania`.

Wymagane dane:

- klient,
- email lub ID klienta,
- data pierwszego zakupu,
- liczba zamowien,
- suma przychodu,
- ostatni zakup,
- produkty kupione,
- kanal pozyskania,
- segment klienta.

## 5. Marketing

URL: `/pl/dashboard/marketing`

Cel: ocena kampanii reklamowych i efektywnosci budzetu.

Podzakladki:

- `Przeglad`,
- `Kampanie`,
- `Google Ads`,
- `Meta Ads`,
- `TikTok Ads`.

Funkcje:

- analiza kosztow reklam,
- ROAS,
- CPC,
- CTR,
- CPM,
- wyswietlenia,
- klikniecia,
- konwersje,
- przychod z kampanii,
- ranking kampanii,
- analiza zrodel reklamowych,
- porownanie kanalow reklamowych.

Akcje AI:

- `Wskaz najlepsze kampanie`,
- `Stworz wykres metod platnosci`,
- `Optymalizuj budzet reklamowy`,
- `Przegladaj gotowe zadania`.

Wymagane dane:

- kampanie Google Ads,
- kampanie Meta Ads,
- kampanie TikTok Ads,
- koszt,
- klikniecia,
- wyswietlenia,
- konwersje,
- przychod przypisany,
- nazwa kampanii,
- grupa reklam,
- data,
- kanal.

## 6. Ruch na stronie / Google Analytics

URL: `/pl/dashboard/google-analytics`

Cel: analiza ruchu, lejka i zdarzen na stronie.

Podzakladki:

- `Przeglad`,
- `Produkty`,
- `Zrodla i zdarzenia`.

Funkcje:

- sesje,
- wyswietlenia produktow,
- dodania do koszyka,
- rozpoczecia platnosci,
- transakcje,
- lejek konwersji,
- zrodla ruchu,
- zdarzenia GA4,
- top strony lub produkty wedlug eventow.

Akcje AI:

- `Stworz wykres ROAS kanalow`,
- `Przeanalizuj lejek konwersji`,
- `Pokaz top strony wedlug eventow`,
- `Przegladaj gotowe zadania`.

Wymagane dane:

- GA4 sessions,
- page views,
- item views,
- add to cart,
- begin checkout,
- purchase,
- traffic source,
- campaign,
- medium,
- source,
- event name,
- event count,
- product/item ID.

## 7. Integracje danych

URL: `/pl/dashboard/integracje-danych`

Cel: zarzadzanie zrodlami danych i kanalami sprzedazy.

Widoki:

- `Integracje zrodel danych`,
- `Moje kanaly sprzedazy`,
- osobne karty kanalow, np. `PL`, `UK`.

Funkcje:

- lista podlaczonych kanalow,
- status integracji,
- wskazanie brakujacych integracji,
- kupowanie dodatkowych podlaczen,
- dodawanie kanalu, jesli limit pozwala,
- konfiguracja danych dla kanalow.

Akcje:

- `Dokup podlaczenia`,
- `Dodaj kanal` - w demo przycisk byl disabled.

Wymagane integracje docelowe:

- sklep internetowy lub marketplace,
- Google Analytics,
- Google Ads,
- Meta Ads,
- TikTok Ads,
- opcjonalnie system platnosci,
- opcjonalnie marketplace fees,
- opcjonalnie arkusze CSV/XLSX.

## 8. Ustawienia firmowe

URL: `/pl/dashboard/ustawienia-firmowe`

Cel: zarzadzanie firma, uzytkownikami, uprawnieniami, kredytami AI i transakcjami.

Widoki i sekcje:

- `Ustawienia Firmowe`,
- `Uzytkownicy`,
- formularz `Dodaj nowego uzytkownika`,
- `Uprawnienia Uzytkownika`,
- `Kredyty AI`,
- zakladka `Transakcje`,
- sekcja usuwania firmy.

Funkcje:

- lista uzytkownikow,
- zapraszanie uzytkownika po emailu,
- role/uprawnienia,
- podglad kredytow AI,
- dokupienie kredytow,
- historia transakcji,
- usuniecie firmy z potwierdzeniem.

Akcje:

- `Dodaj uzytkownika` - w demo disabled,
- `Uzytkownicy`,
- `Transakcje`,
- `Dokup kredyty`,
- `Usun firme` - disabled w demo,
- `Usun firme na zawsze` - disabled w demo,
- `Anuluj`.

Wymagane dane:

- firma/workspace,
- uzytkownicy,
- role,
- zaproszenia,
- stan kredytow AI,
- historia platnosci,
- status subskrypcji.

## 9. Subskrypcja

URL: `/pl/dashboard/subskrypcja`

Cel: wybor planu, liczby podlaczen i obsluga platnosci.

Funkcje:

- pokazanie aktualnego planu,
- konfiguracja liczby podlaczen,
- zgody/regulaminy,
- przejscie do platnosci,
- informacja o warunkach subskrypcji.

Akcje:

- `Przejdz do platnosci` - w demo disabled,
- link do regulaminu.

Wymagane dane:

- plan,
- liczba podlaczen,
- cena,
- waluta,
- okres rozliczeniowy,
- zgody uzytkownika,
- status platnosci.

## AI copilot i gotowe zadania

AI jest obecne jako prawy panel i jako gotowe przyciski na kazdym ekranie.

Glowne funkcje:

- chat z danymi firmy,
- generowanie wykresow,
- generowanie tabel,
- analiza kampanii,
- analiza lejka,
- analiza segmentow klientow,
- sugestie optymalizacji,
- wyszukiwanie anomalii,
- wykrywanie brakow danych,
- proponowanie gotowych zadan analitycznych.

Minimalny MVP:

- panel czatu,
- historia rozmow,
- input tekstowy,
- upload pliku,
- gotowe prompty zalezne od aktualnego modulu,
- odpowiedzi tekstowe,
- odpowiedzi w formie tabeli,
- odpowiedzi w formie wykresu.

Docelowo:

- AI powinno miec kontekst aktywnego dashboardu,
- powinno znac aktualne filtry dat i kanalow,
- powinno umiec odpytywac warstwe metryk,
- powinno sugerowac nastepne pytania.

## Dane i model domenowy

### Encje glowne

- Organization / Company
- User
- Role / Permission
- Channel
- Integration
- Order
- OrderItem
- Product
- Customer
- MarketingCampaign
- MarketingDailyStats
- AnalyticsEvent
- Subscription
- PaymentTransaction
- AiCreditTransaction
- AiConversation
- AiMessage

### Warstwa metryk

System powinien miec osobna warstwe agregacji metryk, zeby UI nie liczyl danych samodzielnie.

Metryki bazowe:

- revenue_net,
- revenue_gross,
- orders_count,
- units_sold,
- discounts,
- product_cost,
- media_cost,
- additional_cost,
- marketplace_cost,
- total_cost,
- profit_net,
- margin,
- cos,
- aov,
- customers_new,
- customers_returning,
- sessions,
- product_views,
- add_to_cart,
- checkout_started,
- transactions,
- impressions,
- clicks,
- cpc,
- ctr,
- cpm,
- roas.

Kazda metryka powinna byc liczona dla:

- zakresu dat,
- zakresu porownawczego,
- kanalu,
- rynku,
- waluty,
- opcjonalnie kampanii, produktu lub segmentu.

## Najwazniejsze flow uzytkownika

### Flow 1: sprawdzenie kondycji sklepu

1. Uzytkownik wchodzi w `Podsumowanie`.
2. Wybiera kanal i zakres dat.
3. Patrzy na przychod, koszty, zysk i kluczowe wskazniki.
4. Przechodzi do segmentow klientow, top produktow i lejka.
5. Pyta AI o mozliwosci wzrostu.

### Flow 2: analiza spadku sprzedazy

1. Uzytkownik otwiera `Zamowienia`.
2. Porownuje okres aktualny z poprzednim.
3. Sprawdza zakladki Rabaty, Platnosci i Dostawa.
4. Przechodzi do Produktow, aby sprawdzic, ktore produkty spadly.
5. Pyta AI o przyczyne spadku.

### Flow 3: optymalizacja marketingu

1. Uzytkownik otwiera `Marketing`.
2. Sprawdza ROAS, CPC, CTR i CPM.
3. Przechodzi przez Google Ads, Meta Ads i TikTok Ads.
4. Otwiera ranking kampanii.
5. Klika `Optymalizuj budzet reklamowy`.

### Flow 4: diagnoza lejka

1. Uzytkownik otwiera `Ruch na stronie`.
2. Sprawdza sesje, wyswietlenia produktow, dodania do koszyka, checkout i transakcje.
3. Analizuje drop-off miedzy etapami.
4. Pyta AI o najwieksze straty w lejku.

### Flow 5: onboarding danych

1. Uzytkownik wchodzi w `Integracje danych`.
2. Widzi podlaczone kanaly.
3. Dodaje kanal lub dokupuje podlaczenia.
4. System pokazuje status dostepnosci danych.
5. Dashboardy zaczynaja korzystac z nowych danych.

## Wymagania UI

Styl:

- czysty SaaS/BI,
- dominujacy niebieski topbar,
- biale karty,
- jasnoszare tlo,
- delikatne obramowania,
- male promienie zaokraglen,
- duzo tabel i gestych danych,
- kolory statusow: zielony, czerwony, niebieski, szary.

Komponenty:

- topbar,
- sidebar ikonowy,
- page header,
- filter bar,
- date range picker,
- dropdown kanalow,
- cards KPI,
- tabs/segmented controls,
- charts,
- data tables,
- right AI drawer,
- modals,
- toasts,
- empty states,
- disabled states,
- loading skeletons.

Zasady:

- dashboard ma byc skanowalny, nie marketingowy,
- najwazniejsze KPI sa zawsze wysoko,
- AI jest pomocnikiem obok danych, nie osobna aplikacja,
- kazdy widok analityczny musi miec stan pusty, stan ladowania i stan bledu,
- komponenty musza dzialac responsywnie, ale priorytetem jest desktop.

## MVP podobnej aplikacji

Pierwsza wersja powinna miec:

- logowanie,
- workspace firmy,
- sidebar i topbar,
- globalny wybor dat i kanalow,
- dashboard Podsumowanie,
- moduly Zamowienia, Produkty, Klienci, Marketing i Ruch,
- import danych z CSV/XLSX jako pierwszy etap zamiast pelnych integracji,
- podstawowe integracje Google Analytics i reklamy jako etap drugi,
- panel AI z gotowymi promptami,
- ustawienia firmowe,
- prosty billing/subskrypcje.

## Kolejnosc implementacji

1. Layout aplikacji: topbar, sidebar, routing, prawa szuflada AI.
2. Model danych i import CSV/XLSX.
3. Warstwa metryk i agregacji.
4. Podsumowanie.
5. Zamowienia i Produkty.
6. Klienci.
7. Marketing.
8. Ruch na stronie.
9. Integracje danych.
10. AI copilot.
11. Ustawienia, kredyty AI i subskrypcja.

## Uwagi prawne i produktowe

Mozemy zbudowac bardzo podobny produkt funkcjonalnie, ale przy implementacji warto stworzyc wlasne nazwy, teksty, branding, ikony i szczegoly wizualne. Najbezpieczniejsza droga to traktowac te materialy jako inspiracje i specyfikacje funkcjonalna, a nie kopiowac 1:1 zasobow, logo, tekstow marketingowych lub identyfikacji wizualnej.
