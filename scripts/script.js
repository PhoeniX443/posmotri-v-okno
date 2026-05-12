/* КОНФИГ */
const preloaderWaitTime = 1200; // исправлено имя
const cardsOnPage = 5;
const BASE_URL = 'https://v-content.practicum-team.ru';
const endpoint = `${BASE_URL}/api/videos?pagination[pageSize]=${cardsOnPage}&`;

/* ЭЛЕМЕНТЫ СТРАНИЦЫ */
const cardsList = document.querySelector('.content__list');
const cardsContainer = document.querySelector('.content__list-container');
const videoContainer = document.querySelector('.result__video-container');
const videoElement = document.querySelector('.result__video');
const form = document.querySelector('form');

/* ТЕМПЛЕЙТЫ */
const cardTmp = document.querySelector('.cards-list-item-template');
const preloaderTmp = document.querySelector('.preloader-template');
const videoNotFoundTmp = document.querySelector('.error-template');
const moreButtonTmp = document.querySelector('.more-button-template');

/* МЕХАНИКА */
let cardsOnPageState = [];
let videoSwitchingInitialized = false; // для однократного делегирования

// Улучшенная функция загрузки видео с проверкой готовности и обработкой ошибок
function loadVideo(video, src, poster) {
  return new Promise((resolve, reject) => {
    // Если видео уже загружено, резолвим сразу
    if (video.readyState >= 3) {
      resolve();
      return;
    }
    video.oncanplaythrough = resolve;
    video.onerror = reject;
    video.src = src;
    if (poster) video.poster = poster;
  });
}

// Функция для установки видео с обработкой ошибок
async function setVideoWithErrorHandling({ baseUrl, video, videoUrl, posterUrl }) {
  try {
    await loadVideo(video, `${baseUrl}${videoUrl}`, `${baseUrl}${posterUrl}`);
  } catch {
    throw new Error('video-load-failed');
  }
}

// Первая загрузка
(async function init() {
  // Удаляем старые прелоадеры на всякий случай
  removePreloader(videoContainer, '.preloader');
  removePreloader(cardsContainer, '.preloader');

  showPreloader(preloaderTmp, videoContainer);
  showPreloader(preloaderTmp, cardsContainer);

  await mainMechanics(endpoint);

  // Обработчик кликов по карточкам – один раз через делегирование
  if (!videoSwitchingInitialized) {
    setupVideoSwitching();
    videoSwitchingInitialized = true;
  }
})();

// Обработка отправки формы
form.onsubmit = async (e) => {
  e.preventDefault();

  // Очистка предыдущих результатов
  cardsList.innerHTML = '';
  const oldButton = cardsContainer.querySelector('.more-button');
  if (oldButton) oldButton.remove();

  // Удаляем блоки ошибок (используем classList.contains)
  [...videoContainer.children].forEach((el) => {
    if (el.classList.contains('error')) el.remove();
  });

  // Удаляем старые прелоадеры перед показом новых
  removePreloader(videoContainer, '.preloader');
  removePreloader(cardsContainer, '.preloader');

  showPreloader(preloaderTmp, videoContainer);
  showPreloader(preloaderTmp, cardsContainer);

  const formData = serializeFormData(form);
  const requestUrl = generateFilterRequest(
    endpoint,
    formData.city,
    formData.timeArray
  );

  await mainMechanics(requestUrl);
};

/* ГЛАВНАЯ ФУНКЦИЯ */
async function mainMechanics(endpoint) {
  try {
    // Добавляем таймаут на fetch (10 секунд)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timeoutId);

    const data = await response.json();
    cardsOnPageState = data.results;

    if (!data?.results?.length) {
      throw new Error('not-found');
    }

    appendCards({
      baseUrl: BASE_URL,
      dataArray: data.results,
      cardTmp,
      container: cardsList,
    });

    // Устанавливаем первое видео с обработкой ошибок
    await setVideoWithErrorHandling({
      baseUrl: BASE_URL,
      video: videoElement,
      videoUrl: data.results[0].video.url,
      posterUrl: data.results[0].poster.url,
    });

    // Подсвечиваем первую карточку
    const firstCard = document.querySelector('.content__card-link');
    if (firstCard) firstCard.classList.add('content__card-link_current');

    // Убираем прелоадеры
    removePreloader(videoContainer, '.preloader');
    removePreloader(cardsContainer, '.preloader');

    // Добавляем класс для кастомного скроллбара
    cardsContainer.classList.add('custom-scrollbar');

    // Кнопка "Показать ещё"
    showMoreCards({
      dataArray: data,
      buttonTemplate: moreButtonTmp,
      cardsList,
      buttonSelector: '.more-button',
      initialEndpoint: endpoint,
      baseUrl: BASE_URL,
      cardTmp: cardTmp,
    });
  } catch (err) {
    let message = 'Ошибка получения данных :(';
    if (err.name === 'AbortError') {
      message = 'Превышено время ожидания ответа';
    } else if (err.message === 'not-found') {
      message = 'Нет подходящих видео =(';
    }
    showError(videoContainer, videoNotFoundTmp, message);
    console.error(err);
    removePreloader(videoContainer, '.preloader');
    removePreloader(cardsContainer, '.preloader');
  }
}

/* Делегирование события клика на карточки */
function setupVideoSwitching() {
  cardsList.addEventListener('click', async (e) => {
    const link = e.target.closest('.content__card-link');
    if (!link) return;
    e.preventDefault();

    // Убираем класс current у всех, добавляем текущей
    document.querySelectorAll('.content__card-link').forEach((item) => {
      item.classList.remove('content__card-link_current');
    });
    link.classList.add('content__card-link_current');

    showPreloader(preloaderTmp, videoContainer);

    // Используем data-id (сохраняется в appendCards)
    const videoId = link.dataset.id;
    const videoObj = cardsOnPageState.find((v) => String(v.id) === String(videoId));

    if (!videoObj) {
      removePreloader(videoContainer, '.preloader');
      showError(videoContainer, videoNotFoundTmp, 'Видео не найдено');
      return;
    }

    try {
      await setVideoWithErrorHandling({
        baseUrl: BASE_URL,
        video: videoElement,
        videoUrl: videoObj.video.url,
        posterUrl: videoObj.poster.url,
      });
    } catch {
      removePreloader(videoContainer, '.preloader');
      showError(videoContainer, videoNotFoundTmp, 'Не удалось загрузить видео');
      return;
    }

    removePreloader(videoContainer, '.preloader');
  });
}

/* УТИЛИТЫ */

function showPreloader(tmp, parent) {
  const node = tmp.content.cloneNode(true);
  parent.append(node);
}

function removePreloader(parent, preloaderSelector) {
  const preloader = parent.querySelector(preloaderSelector);
  if (preloader) preloader.remove();
}

function appendCards({ baseUrl, dataArray, cardTmp, container }) {
  dataArray.forEach((el) => {
    const node = cardTmp.content.cloneNode(true);
    const link = node.querySelector('a');
    // Сохраняем id в data-атрибут (без конфликтов)
    link.dataset.id = el.id;
    link.querySelector('.content__video-card-title').textContent = el.city;
    link.querySelector('.content__video-card-description').textContent = el.description;
    const img = link.querySelector('.content__video-card-thumbnail');
    img.src = `${baseUrl}${el.thumbnail.url}`;
    img.alt = el.description;
    container.append(node);
  });
}

function serializeFormData(form) {
  const cityInput = form.querySelector('input[name="city"]');
  const city = cityInput.value.trim(); // обрезаем пробелы
  const checkboxes = form.querySelectorAll('input[name="time"]');
  const checkedValuesArray = [...checkboxes]
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);
  return { city, timeArray: checkedValuesArray };
}

function generateFilterRequest(endpoint, city, timeArray) {
  // Удаляем концевой &, если есть
  const base = endpoint.endsWith('&') ? endpoint.slice(0, -1) : endpoint;
  const params = new URLSearchParams();

  if (city) {
    params.append('filters[city][$containsi]', city); // автоматическое кодирование
  }
  if (timeArray) {
    timeArray.forEach((timeslot) => {
      params.append('filters[time_of_day][$eqi]', timeslot);
    });
  }

  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}${params.toString()}`;
}

function showError(container, errorTemplate, errorMessage) {
  // Удаляем предыдущие ошибки в этом контейнере
  [...container.children].forEach((el) => {
    if (el.classList.contains('error')) el.remove();
  });
  const node = errorTemplate.content.cloneNode(true);
  node.querySelector('.error__title').textContent = errorMessage;
  container.append(node);
}

function showMoreCards({
  dataArray,
  buttonTemplate,
  cardsList,
  buttonSelector,
  initialEndpoint,
  baseUrl,
  cardTmp,
}) {
  if (dataArray.pagination.page === dataArray.pagination.pageCount) return;

  const button = buttonTemplate.content.cloneNode(true);
  cardsContainer.append(button);
  const buttonInDOM = cardsContainer.querySelector(buttonSelector);

  buttonInDOM.addEventListener('click', async () => {
    // Блокируем кнопку
    buttonInDOM.disabled = true;

    const currentPage = dataArray.pagination.page;
    // Корректно строим URL через URL объект
    const url = new URL(initialEndpoint, window.location.origin);
    url.searchParams.set('pagination[page]', currentPage + 1);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      const newData = await response.json();
      buttonInDOM.remove();

      cardsOnPageState = cardsOnPageState.concat(newData.results);
      appendCards({
        baseUrl,
        dataArray: newData.results,
        cardTmp,
        container: cardsList,
      });

      // Не нужно переустанавливать обработчики – делегирование уже работает

      showMoreCards({
        dataArray: newData,
        buttonTemplate,
        cardsList,
        buttonSelector,
        initialEndpoint,
        baseUrl,
        cardTmp,
      });
    } catch (err) {
      // Разблокируем кнопку и показываем ошибку
      buttonInDOM.disabled = false;
      let message = 'Не удалось загрузить ещё видео';
      if (err.name === 'AbortError') message = 'Таймаут загрузки';
      showError(cardsContainer, videoNotFoundTmp, message);
    }
  });
}
