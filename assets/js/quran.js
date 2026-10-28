const API_BASE = "https://equran.id/api/v2";
const REQUEST_TIMEOUT_MS = 12000;
const SURAH_COUNT = 114;
const FEATURED_SURAHS = [18, 36, 55, 56, 67];
const PRAYER_TIMES = [
  ["subuh", "Subuh"],
  ["dzuhur", "Dzuhur"],
  ["ashar", "Ashar"],
  ["maghrib", "Maghrib"],
  ["isya", "Isya"]
];
const RECITERS = {
  "01": "Abdullah Al-Juhany",
  "02": "Abdul Muhsin Al-Qasim",
  "03": "Abdurrahman As-Sudais",
  "04": "Ibrahim Al-Dossari",
  "05": "Misyari Rasyid Al-Afasy",
  "06": "Yasser Al-Dosari"
};

const cache = {
  surahs: null,
  details: new Map(),
  pendingDetails: new Map(),
  tafsir: new Map(),
  pendingTafsir: new Map(),
  duas: null,
  provinces: null,
  cities: new Map(),
  schedules: new Map()
};

const elements = {
  list: document.querySelector("#surah-list"),
  listStatus: document.querySelector("#list-status"),
  search: document.querySelector("#surah-search"),
  surahTotal: document.querySelector("#surah-total"),
  breadcrumb: document.querySelector("#current-surah-crumb"),
  title: document.querySelector("#surah-title"),
  kicker: document.querySelector("#surah-kicker"),
  meta: document.querySelector("#surah-meta"),
  arabicName: document.querySelector("#surah-name-arabic"),
  readerStatus: document.querySelector("#reader-status"),
  verses: document.querySelector("#verses"),
  arabicSize: document.querySelector("#arabic-size"),
  previous: document.querySelector("#previous-surah"),
  previousName: document.querySelector("#previous-name"),
  next: document.querySelector("#next-surah"),
  nextName: document.querySelector("#next-name"),
  quickGrid: document.querySelector("#quick-grid"),
  audio: document.querySelector("#surah-audio"),
  audioTitle: document.querySelector("#audio-track-title"),
  reciter: document.querySelector("#reciter-select"),
  previewPlay: document.querySelector("#preview-play"),
  previewTitle: document.querySelector("#preview-title"),
  previewMeta: document.querySelector("#preview-meta"),
  previewArabic: document.querySelector("#preview-arabic"),
  previewTranslation: document.querySelector("#preview-translation"),
  previewKicker: document.querySelector("#preview-kicker"),
  previewReciter: document.querySelector("#preview-reciter"),
  previewAudioLabel: document.querySelector("#preview-audio-label"),
  latinToggle: document.querySelector("#latin-toggle"),
  themeToggle: document.querySelector("#theme-toggle"),
  province: document.querySelector("#province-select"),
  city: document.querySelector("#city-select"),
  prayerDate: document.querySelector("#prayer-date"),
  prayerStatus: document.querySelector("#prayer-status"),
  prayerGrid: document.querySelector("#prayer-times-grid"),
  doaGroup: document.querySelector("#doa-group"),
  doaTitle: document.querySelector("#doa-title"),
  doaArabic: document.querySelector("#doa-arabic"),
  doaLatin: document.querySelector("#doa-latin"),
  doaTranslation: document.querySelector("#doa-translation"),
  doaReference: document.querySelector("#doa-reference"),
  doaStatus: document.querySelector("#doa-status"),
  doaPrevious: document.querySelector("#doa-previous"),
  doaNext: document.querySelector("#doa-next")
};

let surahs = [];
let currentSurah = 1;
let selectionVersion = 0;
let activePlace = "all";
let dailyDuas = [];
let currentDuaIndex = 0;
let locationVersion = 0;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateSurahList(payload) {
  if (!isRecord(payload) || payload.code !== 200 || !Array.isArray(payload.data) || payload.data.length !== SURAH_COUNT) {
    throw new Error("Respons daftar surah tidak sesuai format yang diharapkan.");
  }
  payload.data.forEach((surah, index) => {
    if (!isRecord(surah) || surah.nomor !== index + 1 || !isNonEmptyString(surah.namaLatin) ||
      !isNonEmptyString(surah.nama) || !Number.isInteger(surah.jumlahAyat) || surah.jumlahAyat < 1) {
      throw new Error("Data daftar surah tidak lengkap atau tidak valid.");
    }
  });
  return payload.data;
}

function validateSurahDetail(payload, expectedNumber) {
  const detail = payload?.data;
  if (!isRecord(payload) || payload.code !== 200 || !isRecord(detail) ||
    detail.nomor !== expectedNumber || !isNonEmptyString(detail.namaLatin) ||
    !isNonEmptyString(detail.nama) || !Number.isInteger(detail.jumlahAyat) ||
    !Array.isArray(detail.ayat) || detail.ayat.length !== detail.jumlahAyat) {
    throw new Error("Respons detail surah tidak sesuai format yang diharapkan.");
  }
  if (!isRecord(detail.audioFull)) {
    throw new Error("Audio surah tidak tersedia dalam respons API.");
  }
  for (const [reciterId, audioUrl] of Object.entries(detail.audioFull)) {
    if (RECITERS[reciterId] && !isTrustedAudioUrl(audioUrl)) {
      throw new Error("Alamat audio surah dari API tidak valid.");
    }
  }

  detail.ayat.forEach((ayah, index) => {
    if (!isRecord(ayah) || ayah.nomorAyat !== index + 1 ||
      !isNonEmptyString(ayah.teksArab) || !isNonEmptyString(ayah.teksIndonesia)) {
      throw new Error("Data ayat tidak lengkap atau tidak valid.");
    }
  });
  return detail;
}

function isTrustedAudioUrl(value) {
  if (!isNonEmptyString(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "cdn.equran.id";
  } catch {
    return false;
  }
}

function validateTafsir(payload, expectedNumber) {
  const data = payload?.data;
  if (!isRecord(payload) || payload.code !== 200 || !isRecord(data) ||
    data.nomor !== expectedNumber || !Array.isArray(data.tafsir)) {
    throw new Error("Respons tafsir tidak sesuai format yang diharapkan.");
  }
  data.tafsir.forEach((entry) => {
    if (!isRecord(entry) || !Number.isInteger(entry.ayat) || !isNonEmptyString(entry.teks)) {
      throw new Error("Data tafsir tidak lengkap atau tidak valid.");
    }
  });
  return data.tafsir;
}

async function fetchResource(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = { Accept: "application/json" };
  const request = { signal: controller.signal, method: options.method || "GET", headers };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    request.body = JSON.stringify(options.body);
  }
  try {
    const response = await fetch(url, request);
    if (!response.ok) {
      throw new Error(`Layanan Al-Qur’an merespons dengan status ${response.status}.`);
    }
    try {
      return await response.json();
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error("Layanan Al-Qur’an mengirim data yang tidak dapat dibaca.");
      }
      throw error;
    }
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Permintaan terlalu lama. Periksa koneksi internet lalu coba lagi.");
    }
    if (error instanceof TypeError) {
      throw new Error("Tidak dapat terhubung ke layanan Al-Qur’an. Periksa koneksi internet lalu coba lagi.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function fetchJson(path, options) {
  return fetchResource(`${API_BASE}${path}`, options);
}

async function getSurahList() {
  if (cache.surahs) return cache.surahs;
  const data = validateSurahList(await fetchJson("/surat"));
  cache.surahs = data;
  return data;
}

async function getSurahDetail(number) {
  if (cache.details.has(number)) return cache.details.get(number);
  if (cache.pendingDetails.has(number)) return cache.pendingDetails.get(number);
  const request = fetchJson(`/surat/${number}`)
    .then((payload) => {
      const detail = validateSurahDetail(payload, number);
      cache.details.set(number, detail);
      return detail;
    })
    .finally(() => cache.pendingDetails.delete(number));
  cache.pendingDetails.set(number, request);
  return request;
}

async function getTafsir(number) {
  if (cache.tafsir.has(number)) return cache.tafsir.get(number);
  if (cache.pendingTafsir.has(number)) return cache.pendingTafsir.get(number);
  const request = fetchJson(`/tafsir/${number}`)
    .then((payload) => {
      const tafsir = validateTafsir(payload, number);
      cache.tafsir.set(number, tafsir);
      return tafsir;
    })
    .finally(() => cache.pendingTafsir.delete(number));
  cache.pendingTafsir.set(number, request);
  return request;
}

function validateDoas(payload) {
  if (!isRecord(payload) || payload.status !== "success" || !Array.isArray(payload.data) ||
    payload.data.length === 0) {
    throw new Error("Respons daftar doa tidak sesuai format yang diharapkan.");
  }
  payload.data.forEach((doa) => {
    if (!isRecord(doa) || !Number.isInteger(doa.id) || !isNonEmptyString(doa.ar) ||
      typeof doa.tr !== "string" || typeof doa.idn !== "string") {
      throw new Error("Data doa tidak lengkap atau tidak valid.");
    }
  });
  return payload.data;
}

async function getDoas() {
  if (cache.duas) return cache.duas;
  const payload = await fetchResource("https://equran.id/api/doa");
  cache.duas = validateDoas(payload);
  return cache.duas;
}

function validateNameList(payload, label) {
  if (!isRecord(payload) || payload.code !== 200 || !Array.isArray(payload.data) ||
    payload.data.length === 0 || !payload.data.every(isNonEmptyString)) {
    throw new Error(`Respons daftar ${label} tidak sesuai format yang diharapkan.`);
  }
  return payload.data;
}

async function getProvinces() {
  if (cache.provinces) return cache.provinces;
  const payload = await fetchJson("/shalat/provinsi");
  cache.provinces = validateNameList(payload, "provinsi");
  return cache.provinces;
}

async function getCities(province) {
  if (cache.cities.has(province)) return cache.cities.get(province);
  const payload = await fetchJson("/shalat/kabkota", {
    method: "POST",
    body: { provinsi: province }
  });
  const cities = validateNameList(payload, "kabupaten/kota");
  cache.cities.set(province, cities);
  return cities;
}

async function getPrayerSchedule(province, city, date) {
  const key = `${province}|${city}|${date.getFullYear()}-${date.getMonth() + 1}`;
  if (cache.schedules.has(key)) return cache.schedules.get(key);
  const payload = await fetchJson("/shalat", {
    method: "POST",
    body: {
      provinsi: province,
      kabkota: city,
      bulan: date.getMonth() + 1,
      tahun: date.getFullYear()
    }
  });
  const data = payload?.data;
  if (!isRecord(payload) || payload.code !== 200 || !isRecord(data) ||
    !Array.isArray(data.jadwal) || !data.jadwal.every((entry) =>
      isRecord(entry) && Number.isInteger(entry.tanggal) &&
      PRAYER_TIMES.every(([key]) => isNonEmptyString(entry[key])))) {
    throw new Error("Respons jadwal shalat tidak sesuai format yang diharapkan.");
  }
  cache.schedules.set(key, data.jadwal);
  return data.jadwal;
}

function showDailyError(element, error, retry) {
  element.replaceChildren();
  element.classList.add("daily-error");
  const message = document.createElement("span");
  message.textContent = error.message || "Data belum dapat dimuat.";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Coba lagi";
  button.addEventListener("click", retry, { once: true });
  element.append(message, button);
}

function renderPrayerSchedule(schedule, city, province, date) {
  const day = schedule.find((entry) => entry.tanggal === date.getDate());
  if (!day) throw new Error("Jadwal untuk tanggal hari ini tidak tersedia.");
  const dateLabel = new Intl.DateTimeFormat("id-ID", { dateStyle: "full" }).format(date);
  elements.prayerDate.textContent = `${dateLabel} · ${city}, ${province}`;
  const currentMinute = date.getHours() * 60 + date.getMinutes();
  let nextPrayerIndex = PRAYER_TIMES.findIndex(([key]) => {
    const [hour, minute] = day[key].split(":").map(Number);
    return hour * 60 + minute >= currentMinute;
  });
  const fragment = document.createDocumentFragment();
  PRAYER_TIMES.forEach(([key, label], index) => {
    const item = document.createElement("div");
    item.className = "prayer-time";
    if (index === nextPrayerIndex) item.classList.add("is-current");
    const name = document.createElement("strong");
    name.textContent = label;
    const time = document.createElement("span");
    time.textContent = day[key];
    item.append(name, time);
    fragment.append(item);
  });
  elements.prayerGrid.replaceChildren(fragment);
  elements.prayerStatus.replaceChildren();
  elements.prayerStatus.classList.remove("daily-error");
}

async function loadPrayerSchedule(version = locationVersion) {
  const province = elements.province.value;
  const city = elements.city.value;
  if (!province || !city) return;
  elements.prayerStatus.textContent = "Memuat jadwal shalat…";
  elements.prayerStatus.classList.remove("daily-error");
  try {
    const date = new Date();
    const schedule = await getPrayerSchedule(province, city, date);
    if (version !== locationVersion) return;
    renderPrayerSchedule(schedule, city, province, date);
  } catch (error) {
    if (version !== locationVersion) return;
    showDailyError(elements.prayerStatus, error, () => loadPrayerSchedule());
  }
}

async function loadCities(province) {
  const version = ++locationVersion;
  elements.city.disabled = true;
  elements.city.replaceChildren();
  elements.prayerGrid.replaceChildren();
  elements.prayerDate.textContent = "Memuat wilayah…";
  elements.prayerStatus.textContent = "Memuat daftar kabupaten/kota…";
  elements.prayerStatus.classList.remove("daily-error");
  try {
    const cities = await getCities(province);
    if (version !== locationVersion) return;
    const fragment = document.createDocumentFragment();
    cities.forEach((city) => {
      const option = document.createElement("option");
      option.value = city;
      option.textContent = city;
      fragment.append(option);
    });
    elements.city.replaceChildren(fragment);
    elements.city.value = cities.includes("Kab. Bogor")
      ? "Kab. Bogor"
      : cities.find((city) => city.startsWith("Kota ")) || cities[0];
    elements.city.disabled = false;
    await loadPrayerSchedule(version);
  } catch (error) {
    if (version !== locationVersion) return;
    showDailyError(elements.prayerStatus, error, () => loadCities(province));
  }
}

function renderDua(index) {
  if (dailyDuas.length === 0) return;
  currentDuaIndex = (index + dailyDuas.length) % dailyDuas.length;
  const doa = dailyDuas[currentDuaIndex];
  elements.doaGroup.textContent = doa.grup || "Doa & Dzikir";
  elements.doaTitle.textContent = doa.nama || "Doa";
  elements.doaArabic.textContent = doa.ar;
  elements.doaLatin.textContent = doa.tr;
  elements.doaTranslation.textContent = doa.idn;
  elements.doaLatin.hidden = !doa.tr;
  elements.doaTranslation.hidden = !doa.idn;
  elements.doaReference.textContent = doa.tentang || "";
  elements.doaPrevious.disabled = dailyDuas.length < 2;
  elements.doaNext.disabled = dailyDuas.length < 2;
  elements.doaStatus.textContent = `${currentDuaIndex + 1} dari ${dailyDuas.length} doa`;
  elements.doaStatus.classList.remove("daily-error");
}

async function initializePrayerTimes() {
  elements.prayerStatus.textContent = "Memuat daftar wilayah…";
  try {
    const provinces = await getProvinces();
    const fragment = document.createDocumentFragment();
    provinces.forEach((province) => {
      const option = document.createElement("option");
      option.value = province;
      option.textContent = province;
      fragment.append(option);
    });
    elements.province.replaceChildren(fragment);
    elements.province.value = provinces.includes("Jawa Barat") ? "Jawa Barat" : provinces[0];
    elements.province.disabled = false;
    await loadCities(elements.province.value);
  } catch (error) {
    showDailyError(elements.prayerStatus, error, initializePrayerTimes);
  }
}

async function initializeDoas() {
  elements.doaStatus.textContent = "Memuat doa dari EQuran.id API…";
  try {
    dailyDuas = await getDoas();
    renderDua(0);
  } catch (error) {
    showDailyError(elements.doaStatus, error, initializeDoas);
  }
}

function initializeDailyFeatures() {
  elements.province.addEventListener("change", () => loadCities(elements.province.value));
  elements.city.addEventListener("change", () => {
    locationVersion += 1;
    loadPrayerSchedule(locationVersion);
  });
  elements.doaPrevious.addEventListener("click", () => renderDua(currentDuaIndex - 1));
  elements.doaNext.addEventListener("click", () => renderDua(currentDuaIndex + 1));
  initializePrayerTimes();
  initializeDoas();
}

function renderFeaturedSurahs() {
  const fragment = document.createDocumentFragment();
  for (const number of FEATURED_SURAHS) {
    const surah = surahs[number - 1];
    if (!surah) continue;
    const link = document.createElement("a");
    link.className = "quick-card";
    link.href = `?surah=${surah.nomor}#reader`;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      openSurah(surah.nomor);
    });

    const badge = document.createElement("span");
    badge.className = "quick-number";
    badge.textContent = String(surah.nomor);
    const copy = document.createElement("span");
    copy.className = "quick-card-copy";
    const title = document.createElement("strong");
    title.textContent = surah.namaLatin;
    const subtitle = document.createElement("small");
    subtitle.textContent = `${surah.arti || "Surah"} · ${surah.jumlahAyat} ayat`;
    copy.append(title, subtitle);
    const arabic = document.createElement("span");
    arabic.className = "quick-arabic";
    arabic.lang = "ar";
    arabic.dir = "rtl";
    arabic.textContent = surah.nama;
    link.append(badge, copy, arabic);
    fragment.append(link);
  }
  elements.quickGrid.replaceChildren(fragment);
}

function renderPreview(detail) {
  const firstAyah = detail.ayat[0];
  elements.previewTitle.textContent = detail.namaLatin;
  elements.previewMeta.textContent = `${detail.arti || "Al-Qur’an"} / ${detail.jumlahAyat} ayat / ${detail.tempatTurun || "Al-Qur’an"}`;
  elements.previewArabic.textContent = firstAyah.teksArab;
  elements.previewTranslation.textContent = firstAyah.teksIndonesia;
  elements.previewKicker.textContent = `QURAN READER / ${String(detail.nomor).padStart(3, "0")}`;
  elements.previewAudioLabel.textContent = `AUDIO SURAT / ${String(detail.nomor).padStart(3, "0")}`;
}

async function playAudio(audioUrl, title) {
  if (!isTrustedAudioUrl(audioUrl)) {
    showStatus("Audio untuk qari ini tidak tersedia.", true);
    return;
  }
  elements.audio.src = audioUrl;
  elements.audio.load();
  elements.audioTitle.textContent = title;
  try {
    await elements.audio.play();
    showStatus("");
  } catch (error) {
    if (error.name === "NotAllowedError") {
      showStatus("Pemutaran audio diblokir browser. Tekan tombol putar pada pemutar audio.", true);
      return;
    }
    showStatus("Audio tidak dapat diputar. Periksa koneksi internet lalu coba lagi.", true);
  }
}

function updateReciterLabel() {
  const name = RECITERS[elements.reciter.value];
  elements.previewReciter.textContent = name;
  const currentSource = elements.audio.currentSrc || elements.audio.src;
  if (currentSource && currentSource.includes("/audio-full/")) {
    const currentDetail = cache.details.get(currentSurah);
    elements.audio.pause();
    elements.audio.removeAttribute("src");
    if (currentDetail) {
      elements.audio.src = currentDetail.audioFull[elements.reciter.value] || "";
      elements.audio.load();
      elements.audioTitle.textContent = `${currentDetail.namaLatin} · ${name}`;
    }
  }
}

function showStatus(message, isError = false, retry = null) {
  elements.readerStatus.replaceChildren();
  elements.readerStatus.classList.toggle("is-error", isError);
  if (!message) return;
  const text = document.createElement("span");
  text.textContent = message;
  elements.readerStatus.append(text);
  if (retry) {
    const button = document.createElement("button");
    button.className = "retry-button";
    button.type = "button";
    button.textContent = "Coba lagi";
    button.addEventListener("click", retry, { once: true });
    elements.readerStatus.append(button);
  }
}

function showListError(error) {
  elements.list.replaceChildren();
  elements.listStatus.replaceChildren();
  const message = document.createElement("span");
  message.textContent = error.message;
  elements.listStatus.append(message, document.createTextNode(" "));
  const retry = document.createElement("button");
  retry.className = "retry-button";
  retry.type = "button";
  retry.textContent = "Coba lagi";
  retry.addEventListener("click", initialize, { once: true });
  elements.listStatus.append(retry);
}

function renderSurahList(query = "") {
  const normalizedQuery = query.trim().toLocaleLowerCase("id");
  const matches = surahs.filter((surah) => {
    if (activePlace !== "all" && surah.tempatTurun !== activePlace) return false;
    const searchable = `${surah.nomor} ${surah.namaLatin} ${surah.nama} ${surah.arti || ""}`.toLocaleLowerCase("id");
    return searchable.includes(normalizedQuery);
  });
  const fragment = document.createDocumentFragment();
  for (const surah of matches) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.className = "surah-option";
    button.type = "button";
    button.dataset.surah = String(surah.nomor);
    button.setAttribute("aria-current", String(surah.nomor === currentSurah));

    const number = document.createElement("span");
    number.className = "surah-number";
    number.textContent = String(surah.nomor);

    const copy = document.createElement("span");
    copy.className = "surah-option-copy";
    const name = document.createElement("strong");
    name.textContent = surah.namaLatin;
    const meaning = document.createElement("small");
    meaning.textContent = `${surah.arti || "Surah"} · ${surah.jumlahAyat} ayat`;
    copy.append(name, meaning);

    const arabicName = document.createElement("span");
    arabicName.className = "surah-option-arabic";
    arabicName.lang = "ar";
    arabicName.dir = "rtl";
    arabicName.textContent = surah.nama;

    button.append(number, copy, arabicName);
    button.addEventListener("click", () => openSurah(surah.nomor));
    item.append(button);
    fragment.append(item);
  }
  if (matches.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-search";
    empty.textContent = "Surah tidak ditemukan.";
    fragment.append(empty);
  }
  elements.list.replaceChildren(fragment);
  elements.listStatus.textContent = `${matches.length} surah`;
  elements.surahTotal.textContent = String(surahs.length);
}

function updateNavigation(number) {
  const previous = surahs[number - 2];
  const next = surahs[number];
  elements.previous.disabled = !previous;
  elements.previousName.textContent = previous?.namaLatin || "Awal surah";
  elements.previous.onclick = previous ? () => openSurah(previous.nomor) : null;
  elements.next.disabled = !next;
  elements.nextName.textContent = next?.namaLatin || "Akhir surah";
  elements.next.onclick = next ? () => openSurah(next.nomor) : null;
}

function renderDetail(detail) {
  elements.breadcrumb.textContent = detail.namaLatin;
  elements.title.textContent = detail.namaLatin;
  elements.kicker.textContent = `SURAH ${detail.nomor}`;
  elements.meta.textContent = `${detail.arti || "Al-Qur’an"} · ${detail.tempatTurun || "Al-Qur’an"} · ${detail.jumlahAyat} ayat`;
  elements.arabicName.textContent = detail.nama;
  elements.audio.pause();
  elements.audio.src = detail.audioFull[elements.reciter.value] || "";
  elements.audio.load();
  elements.audioTitle.textContent = `${detail.namaLatin} · ${RECITERS[elements.reciter.value]}`;

  const fragment = document.createDocumentFragment();
  for (const ayah of detail.ayat) {
    const article = document.createElement("article");
    article.className = "verse";

    const arabic = document.createElement("p");
    arabic.className = "verse-arabic";
    arabic.lang = "ar";
    arabic.dir = "rtl";
    arabic.textContent = ayah.teksArab;

    const number = document.createElement("span");
    number.className = "verse-number";
    number.setAttribute("aria-label", `Ayat ${ayah.nomorAyat}`);
    number.textContent = String(ayah.nomorAyat);
    arabic.append(document.createTextNode(" "), number);

    const translation = document.createElement("p");
    translation.className = "verse-translation";
    translation.textContent = ayah.teksIndonesia;
    article.append(arabic, translation);
    if (isNonEmptyString(ayah.teksLatin)) {
      const transliteration = document.createElement("p");
      transliteration.className = "verse-latin";
      transliteration.textContent = ayah.teksLatin;
      article.append(transliteration);
    }

    const actions = document.createElement("div");
    actions.className = "verse-actions";
    const playAyah = document.createElement("button");
    playAyah.className = "verse-action";
    playAyah.type = "button";
    playAyah.textContent = "♫ Dengarkan ayat";
    playAyah.addEventListener("click", () => {
      const audioUrl = ayah.audio?.[elements.reciter.value];
      if (!audioUrl) {
        showStatus("Audio untuk ayat ini tidak tersedia.", true);
        return;
      }
      playAudio(audioUrl, `${detail.namaLatin} · Ayat ${ayah.nomorAyat} · ${RECITERS[elements.reciter.value]}`);
      document.querySelector("#reader-audio").scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    const tafsirButton = document.createElement("button");
    tafsirButton.className = "verse-action";
    tafsirButton.type = "button";
    tafsirButton.textContent = "Buka tafsir";
    tafsirButton.setAttribute("aria-expanded", "false");
    const tafsir = document.createElement("div");
    tafsir.className = "verse-tafsir";
    tafsir.hidden = true;
    tafsirButton.addEventListener("click", async () => {
      const isExpanded = tafsirButton.getAttribute("aria-expanded") === "true";
      tafsirButton.setAttribute("aria-expanded", String(!isExpanded));
      tafsir.hidden = isExpanded;
      if (isExpanded || tafsir.dataset.loaded === "true") return;
      tafsir.classList.remove("is-error");
      tafsir.classList.add("is-loading");
      tafsir.textContent = "Memuat tafsir dari EQuran.id API…";
      try {
        const tafsirAyat = await getTafsir(detail.nomor);
        const entry = tafsirAyat.find((item) => item.ayat === ayah.nomorAyat);
        tafsir.textContent = entry?.teks || "Tafsir ayat ini tidak tersedia.";
        tafsir.dataset.loaded = "true";
      } catch (error) {
        tafsir.classList.remove("is-loading");
        tafsir.classList.add("is-error");
        tafsir.textContent = error.message || "Tafsir tidak dapat dimuat.";
        return;
      }
      tafsir.classList.remove("is-loading");
    });
    actions.append(playAyah, tafsirButton);
    article.append(actions, tafsir);
    fragment.append(article);
  }
  elements.verses.replaceChildren(fragment);
}

function updateUrl(number, replace = false) {
  const url = new URL(window.location.href);
  url.searchParams.set("surah", String(number));
  window.history[replace ? "replaceState" : "pushState"]({ surah: number }, "", url);
}

async function openSurah(number, options = {}) {
  if (!Number.isInteger(number) || number < 1 || number > SURAH_COUNT) return;
  const version = ++selectionVersion;
  currentSurah = number;
  renderSurahList(elements.search.value);
  updateNavigation(number);
  elements.title.textContent = surahs[number - 1]?.namaLatin || `Surah ${number}`;
  elements.kicker.textContent = `SURAH ${number}`;
  elements.breadcrumb.textContent = surahs[number - 1]?.namaLatin || `Surah ${number}`;
  elements.meta.textContent = "";
  elements.arabicName.textContent = "";
  elements.verses.replaceChildren();
  showStatus("Memuat ayat…");
  if (options.updateUrl !== false) updateUrl(number);

  try {
    const detail = await getSurahDetail(number);
    if (version !== selectionVersion) return;
    renderDetail(detail);
    if (number === 1) renderPreview(detail);
    showStatus("");
    renderSurahList(elements.search.value);
    if (options.scroll !== false) {
      document.querySelector("#reader").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch (error) {
    if (version !== selectionVersion) return;
    showStatus(error.message || "Terjadi kesalahan saat memuat surah.", true, () => openSurah(number, { updateUrl: false, scroll: false }));
  }
}

async function initialize() {
  elements.listStatus.textContent = "Memuat daftar surah…";
  try {
    surahs = await getSurahList();
    renderSurahList(elements.search.value);
    renderFeaturedSurahs();
    const requested = Number(new URLSearchParams(window.location.search).get("surah"));
    const initialSurah = Number.isInteger(requested) && requested >= 1 && requested <= SURAH_COUNT ? requested : 1;
    if (initialSurah !== requested) updateUrl(initialSurah, true);
    await openSurah(initialSurah, { updateUrl: false, scroll: false });
    try {
      renderPreview(await getSurahDetail(1));
    } catch (error) {
      elements.previewTitle.textContent = "Pratinjau Al-Fatihah";
      elements.previewArabic.textContent = "";
      elements.previewTranslation.textContent = error.message || "Pratinjau belum dapat dimuat.";
      elements.previewPlay.disabled = true;
    }
  } catch (error) {
    showListError(error);
    showStatus("Daftar surah belum dapat dimuat.", true, initialize);
  }
}

elements.search.addEventListener("input", () => renderSurahList(elements.search.value));
elements.arabicSize.addEventListener("input", () => {
  document.documentElement.style.setProperty("--arabic-size", `${elements.arabicSize.value}px`);
});
elements.latinToggle.addEventListener("click", () => {
  const visible = elements.latinToggle.getAttribute("aria-pressed") !== "true";
  elements.latinToggle.setAttribute("aria-pressed", String(visible));
  elements.latinToggle.textContent = visible ? "Sembunyikan latin" : "Transliterasi";
  document.body.classList.toggle("show-transliteration", visible);
});
elements.themeToggle.addEventListener("click", () => {
  const dark = document.body.classList.toggle("dark");
  elements.themeToggle.setAttribute("aria-label", dark ? "Gunakan mode terang" : "Gunakan mode gelap");
});
elements.reciter.addEventListener("change", updateReciterLabel);
elements.previewPlay.addEventListener("click", async () => {
  try {
    const detail = await getSurahDetail(1);
    const audioUrl = detail.audioFull[elements.reciter.value];
    await playAudio(audioUrl, `${detail.namaLatin} · ${RECITERS[elements.reciter.value]}`);
  } catch (error) {
    showStatus(error.message || "Murottal tidak dapat dimuat.", true);
  }
});
elements.audio.addEventListener("error", () => {
  if (elements.audio.currentSrc || elements.audio.src) {
    showStatus("Audio tidak dapat dimuat. Periksa koneksi internet lalu coba lagi.", true);
  }
});
document.querySelectorAll(".filter-chip").forEach((button) => {
  button.addEventListener("click", () => {
    activePlace = button.dataset.place;
    document.querySelectorAll(".filter-chip").forEach((chip) => {
      const selected = chip === button;
      chip.classList.toggle("is-active", selected);
      chip.setAttribute("aria-pressed", String(selected));
    });
    renderSurahList(elements.search.value);
  });
});
window.addEventListener("popstate", () => {
  const requested = Number(new URLSearchParams(window.location.search).get("surah"));
  if (Number.isInteger(requested) && requested >= 1 && requested <= SURAH_COUNT && surahs.length) {
    openSurah(requested, { updateUrl: false, scroll: false });
  }
});
window.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement !== elements.search &&
    !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
    event.preventDefault();
    elements.search.focus();
  }
});

initializeDailyFeatures();
initialize();
