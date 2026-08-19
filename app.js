const TMDB_BEARER_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJlZGIxNGRjZDE2MzJkOWExNWJiNDc4ODc1NDA5ZWZhNyIsIm5iZiI6MTc3NTMxOTAxNC4wMjQ5OTk5LCJzdWIiOiI2OWQxMzdlNmVkZDFiNDhmYTI0ZDJiODkiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.V09fRNSqQH1J8ilYIQ2SP_XUbCh32kMZWg_nW5z9dkw";

// ---------------------------------------------------------------------------
// "Banco de dados" local, usando localStorage no lugar do Supabase.
// ---------------------------------------------------------------------------
const STORAGE_KEY = "grupoDoCinema.movies";

const localDb = {
  _read() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error("Erro ao ler dados locais:", error);
      return [];
    }
  },

  _write(movies) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(movies));
      return true;
    } catch (error) {
      console.error("Erro ao salvar dados locais:", error);
      return false;
    }
  },

  _nextId(movies) {
    return movies.reduce((max, movie) => Math.max(max, Number(movie.id) || 0), 0) + 1;
  },

  list() {
    const movies = this._read();
    movies.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return movies;
  },

  insert(movieData) {
    const movies = this._read();
    const newMovie = {
      id: this._nextId(movies),
      created_at: new Date().toISOString(),
      ...movieData
    };
    movies.push(newMovie);
    this._write(movies);
    return newMovie;
  },

  update(id, patch) {
    const movies = this._read();
    const index = movies.findIndex((movie) => movie.id === id);
    if (index === -1) return null;
    movies[index] = { ...movies[index], ...patch };
    this._write(movies);
    return movies[index];
  },

  remove(id) {
    const movies = this._read();
    const filtered = movies.filter((movie) => movie.id !== id);
    this._write(filtered);
    return true;
  }
};

const sortSelect = document.getElementById("sortSelect");
const watchedGrid = document.getElementById("watchedGrid");
const toWatchGrid = document.getElementById("toWatchGrid");
const searchInput = document.getElementById("searchInput");

const statTotal = document.getElementById("statTotal");
const statWatched = document.getElementById("statWatched");
const statNotWatched = document.getElementById("statNotWatched");

const openAddMovieBtn = document.getElementById("openAddMovieBtn");
const addMovieModal = document.getElementById("addMovieModal");
const closeAddMovieModal = document.getElementById("closeAddMovieModal");

const movieDetailsModal = document.getElementById("movieDetailsModal");
const closeMovieDetailsModal = document.getElementById("closeMovieDetailsModal");
const movieDetailsContent = document.getElementById("movieDetailsContent");

const movieForm = document.getElementById("movieForm");
const apiMovieTitle = document.getElementById("apiMovieTitle");
const searchApiBtn = document.getElementById("searchApiBtn");

const filmsPage = document.getElementById("filmsPage");
const tierlistPage = document.getElementById("tierlistPage");
const filmsTabBtn = document.getElementById("filmsTabBtn");
const tierlistTabBtn = document.getElementById("tierlistTabBtn");
const unrankedPool = document.getElementById("unrankedPool");

let moviesCache = [];
let editingMovieId = null;
let activeModal = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function posterUrl(movie) {
  return movie.poster && movie.poster.trim()
    ? movie.poster
    : "https://placehold.co/500x750/111111/d6a84f?text=Sem+Poster";
}

function watchedLabel(watched) {
  return watched ? "Vimos" : "Não vimos";
}

function updateStats() {
  const watched = moviesCache.filter((m) => m.watched).length;
  const notWatched = moviesCache.length - watched;

  statTotal.textContent = String(moviesCache.length);
  statWatched.textContent = String(watched);
  statNotWatched.textContent = String(notWatched);
}

function setPageTransition(pageElement) {
  if (!pageElement) return;
  pageElement.classList.remove("page-enter");
  void pageElement.offsetWidth;
  pageElement.classList.add("page-enter");
}

function openModal(modal) {
  if (!modal) return;

  activeModal = modal;
  modal.classList.remove("hidden");
  modal.classList.remove("closing");
  modal.classList.add("opening");
  document.body.classList.add("modal-open");

  requestAnimationFrame(() => {
    modal.classList.remove("opening");
    modal.classList.add("open");
  });
}

function closeModal(modal) {
  if (!modal || modal.classList.contains("hidden")) return;

  modal.classList.remove("opening");
  modal.classList.remove("open");
  modal.classList.add("closing");

  const finishClose = () => {
    modal.classList.add("hidden");
    modal.classList.remove("closing");
    if (activeModal === modal) activeModal = null;
    if (!document.querySelector(".modal:not(.hidden)")) {
      document.body.classList.remove("modal-open");
    }
    modal.removeEventListener("transitionend", finishClose);
  };

  modal.addEventListener("transitionend", finishClose);
  setTimeout(finishClose, 220);
}

function resetMovieForm() {
  movieForm.reset();
  editingMovieId = null;
}

function fillMovieForm(movie) {
  document.getElementById("movieTitle").value = movie.title || "";
  document.getElementById("movieYear").value = movie.year || "";
  document.getElementById("moviePoster").value = movie.poster || "";
  document.getElementById("movieDescription").value = movie.description || "";
  document.getElementById("movieTmdbRating").value = movie.tmdb_rating || "";
  editingMovieId = movie.id;
}

function getFilteredAndSortedMovies() {
  const term = searchInput.value.trim().toLowerCase();
  const sortValue = sortSelect ? sortSelect.value : "default";

  const filtered = moviesCache.filter((movie) =>
    String(movie.title || "").toLowerCase().includes(term)
  );

  filtered.sort((a, b) => {
    switch (sortValue) {
      case "az":
        return (a.title || "").localeCompare(b.title || "");
      case "za":
        return (b.title || "").localeCompare(a.title || "");
      case "new":
        return Number(b.year || 0) - Number(a.year || 0);
      case "old":
        return Number(a.year || 0) - Number(b.year || 0);
      case "watched":
        return Number(b.watched) - Number(a.watched);
      default:
        return 0;
    }
  });

  return filtered;
}

function movieCard(movie, index = 0) {
  return `
    <article class="movie-card fade-up-card" style="animation-delay:${index * 0.045}s">
      <div class="movie-thumb" onclick="openMovieDetails(${movie.id})">
        <img
          class="movie-poster"
          src="${posterUrl(movie)}"
          alt="Poster de ${escapeHtml(movie.title)}"
          loading="lazy"
        />
        <button
          class="eye-toggle ${movie.watched ? "is-watched" : ""}"
          type="button"
          title="${movie.watched ? "Marcar como não visto" : "Marcar como visto"}"
          onclick="toggleWatched(event, ${movie.id})"
        >
          ${movie.watched ? "👁️" : "🙈"}
        </button>
      </div>

      <div class="movie-body" onclick="openMovieDetails(${movie.id})">
        <h4 class="movie-title">${escapeHtml(movie.title)}</h4>

        <div class="movie-meta">
          <span>${escapeHtml(movie.year || "Ano desconhecido")}</span>
          <span class="tmdb-chip">★ ${escapeHtml(movie.tmdb_rating || "-")}</span>
        </div>

        <div class="badge-row">
          <span class="badge">${watchedLabel(movie.watched)}</span>
          ${movie.tier ? `<span class="badge">Tier ${escapeHtml(movie.tier)}</span>` : ""}
        </div>
      </div>
    </article>
  `;
}

function tierMovieCard(movie, index = 0) {
  return `
    <div
      class="tier-movie fade-up-card"
      style="animation-delay:${index * 0.035}s"
      draggable="true"
      ondragstart="handleDragStart(event, ${movie.id})"
      onclick="openMovieDetails(${movie.id})"
      title="${escapeHtml(movie.title)}"
    >
      <img
        src="${posterUrl(movie)}"
        alt="Poster de ${escapeHtml(movie.title)}"
        loading="lazy"
      />
      <p>${escapeHtml(movie.title)}</p>
    </div>
  `;
}

function renderMovies() {
  const filtered = getFilteredAndSortedMovies();

  const watchedMovies = filtered.filter((movie) => movie.watched);
  const otherMovies = filtered.filter((movie) => !movie.watched);

  watchedGrid.innerHTML = watchedMovies.length
    ? watchedMovies.map((movie, index) => movieCard(movie, index)).join("")
    : `<p class="empty-state">Nenhum filme visto encontrado.</p>`;

  toWatchGrid.innerHTML = otherMovies.length
    ? otherMovies.map((movie, index) => movieCard(movie, index)).join("")
    : `<p class="empty-state">Nenhum filme pendente encontrado.</p>`;

  updateStats();
}

function renderTierlist() {
  const tiers = ["S", "A", "B", "C", "D", "F"];

  tiers.forEach((tier) => {
    const zone = document.querySelector(`.tier-dropzone[data-tier="${tier}"]`);
    if (!zone) return;

    const movies = moviesCache.filter((movie) => movie.tier === tier);
    zone.innerHTML = movies.length
      ? movies.map((movie, index) => tierMovieCard(movie, index)).join("")
      : "";
  });

  const unranked = moviesCache.filter((movie) => !movie.tier);
  unrankedPool.innerHTML = unranked.length
    ? unranked.map((movie, index) => tierMovieCard(movie, index)).join("")
    : `<p class="empty-state">Todos os filmes já foram rankeados.</p>`;
}

function fetchMovies() {
  moviesCache = localDb.list();
  renderMovies();
  renderTierlist();
}

function openMovieDetails(id) {
  const movie = moviesCache.find((item) => item.id === id);
  if (!movie) return;

  movieDetailsContent.innerHTML = `
  <div class="detail-layout fade-up-card">
    <img
      class="detail-poster"
      src="${posterUrl(movie)}"
      alt="Poster de ${escapeHtml(movie.title)}"
    />

    <div>
      <p class="eyebrow">DETALHES</p>
      <h3 class="detail-title">${escapeHtml(movie.title)}</h3>
      <p class="detail-year">${escapeHtml(movie.year || "Ano desconhecido")}</p>

      <div class="badge-row">
        ${movie.tmdb_rating ? `<span class="badge">TMDb: ${escapeHtml(movie.tmdb_rating)}</span>` : ""}
      </div>

      <p class="detail-description">
        ${escapeHtml(movie.description || "Sem descrição ainda.")}
      </p>
    </div>
  </div>
`;

  openModal(movieDetailsModal);
}

function setWatched(id, watched) {
  const updated = localDb.update(id, { watched: Boolean(watched) });

  if (!updated) {
    alert("Erro ao atualizar filme.");
    return;
  }

  fetchMovies();
  openMovieDetails(id);
}

function toggleWatched(event, id) {
  event.stopPropagation();

  const movie = moviesCache.find((item) => item.id === id);
  if (!movie) return;

  const updated = localDb.update(id, { watched: !movie.watched });

  if (!updated) {
    alert("Erro ao atualizar filme.");
    return;
  }

  fetchMovies();
}

function setTier(id, tier) {
  const updated = localDb.update(id, { tier: tier || null });

  if (!updated) {
    alert("Erro ao atualizar tier.");
    return;
  }

  fetchMovies();
  openMovieDetails(id);
}

function editMovie(id) {
  const movie = moviesCache.find((item) => item.id === id);
  if (!movie) return;

  fillMovieForm(movie);
  closeModal(movieDetailsModal);
  openModal(addMovieModal);
}

function deleteMovie(id) {
  const ok = window.confirm("Quer mesmo apagar esse filme?");
  if (!ok) return;

  localDb.remove(id);
  fetchMovies();
  closeModal(movieDetailsModal);
}

function setSearchLoading(isLoading) {
  if (!searchApiBtn) return;

  searchApiBtn.disabled = isLoading;
  searchApiBtn.textContent = isLoading ? "Buscando..." : "Buscar";
  searchApiBtn.classList.toggle("is-loading", isLoading);
}

async function searchMovieFromTMDb() {
  const query = apiMovieTitle.value.trim();

  if (!query) {
    alert("Digite um filme para buscar.");
    return;
  }

  if (!TMDB_BEARER_TOKEN || TMDB_BEARER_TOKEN.includes("COLE_SEU_TOKEN_AQUI")) {
    alert("Coloque seu token do TMDb no app.js primeiro.");
    return;
  }

  try {
    setSearchLoading(true);

    const response = await fetch(
      `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(query)}&language=pt-BR`,
      {
        headers: {
          Authorization: `Bearer ${TMDB_BEARER_TOKEN}`,
          accept: "application/json"
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(data);
      alert(data.status_message || "Erro ao buscar filme.");
      return;
    }

    const movie = data.results?.[0];

    if (!movie) {
      alert("Filme não encontrado.");
      return;
    }

    document.getElementById("movieTitle").value = movie.title || "";
    document.getElementById("movieYear").value = movie.release_date
      ? movie.release_date.slice(0, 4)
      : "";
    document.getElementById("moviePoster").value = movie.poster_path
      ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
      : "";
    document.getElementById("movieDescription").value = movie.overview || "";
    document.getElementById("movieTmdbRating").value = movie.vote_average
      ? Number(movie.vote_average).toFixed(1)
      : "";
  } catch (error) {
    console.error(error);
    alert("Erro ao buscar filme.");
  } finally {
    setSearchLoading(false);
  }
}

function showPage(page) {
  const isFilms = page === "films";

  filmsPage.classList.toggle("hidden", !isFilms);
  tierlistPage.classList.toggle("hidden", isFilms);

  filmsTabBtn.classList.toggle("active", isFilms);
  tierlistTabBtn.classList.toggle("active", !isFilms);

  if (isFilms) {
    setPageTransition(filmsPage);
  } else {
    renderTierlist();
    setPageTransition(tierlistPage);
  }
}

function handleDragStart(event, movieId) {
  event.dataTransfer.setData("text/plain", String(movieId));
  event.dataTransfer.effectAllowed = "move";
  document.body.classList.add("is-dragging");
}

function handleDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  event.currentTarget.classList.add("drag-over");
}

function handleDragLeave(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX;
  const y = event.clientY;

  const isOutside =
    x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;

  if (isOutside) {
    event.currentTarget.classList.remove("drag-over");
  }
}

function clearDragState() {
  document.body.classList.remove("is-dragging");
  document.querySelectorAll(".drag-over").forEach((element) => {
    element.classList.remove("drag-over");
  });
}

function handleDropToTier(event) {
  event.preventDefault();
  event.currentTarget.classList.remove("drag-over");
  document.body.classList.remove("is-dragging");

  const movieId = Number(event.dataTransfer.getData("text/plain"));
  const tier = event.currentTarget.dataset.tier;

  const movie = moviesCache.find((item) => item.id === movieId);
  if (!movie) return;

  const updated = localDb.update(movieId, { tier });

  if (!updated) {
    alert("Erro ao mover filme.");
    return;
  }

  fetchMovies();
}

function handleDropToPool(event) {
  event.preventDefault();
  event.currentTarget.classList.remove("drag-over");
  document.body.classList.remove("is-dragging");

  const movieId = Number(event.dataTransfer.getData("text/plain"));

  const movie = moviesCache.find((item) => item.id === movieId);
  if (!movie) return;

  const updated = localDb.update(movieId, { tier: null });

  if (!updated) {
    alert("Erro ao mover filme.");
    return;
  }

  fetchMovies();
}

movieForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const title = document.getElementById("movieTitle").value.trim();
  const year = document.getElementById("movieYear").value.trim();
  const poster = document.getElementById("moviePoster").value.trim();
  const description = document.getElementById("movieDescription").value.trim();
  const tmdbRating = document.getElementById("movieTmdbRating").value || null;

  if (!title) {
    alert("Título obrigatório.");
    return;
  }

  if (editingMovieId) {
    const updated = localDb.update(editingMovieId, {
      title,
      year,
      poster,
      description,
      tmdb_rating: tmdbRating
    });

    if (!updated) {
      alert("Erro ao editar filme.");
      return;
    }
  } else {
    localDb.insert({
      title,
      year,
      poster,
      description,
      watched: false,
      tier: null,
      tmdb_rating: tmdbRating
    });
  }

  fetchMovies();
  resetMovieForm();
  closeModal(addMovieModal);
});

searchInput.addEventListener("input", renderMovies);
sortSelect.addEventListener("change", renderMovies);
searchApiBtn.addEventListener("click", searchMovieFromTMDb);

apiMovieTitle.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    searchMovieFromTMDb();
  }
});

filmsTabBtn.addEventListener("click", () => showPage("films"));
tierlistTabBtn.addEventListener("click", () => showPage("tierlist"));

openAddMovieBtn.addEventListener("click", () => {
  resetMovieForm();
  openModal(addMovieModal);
});

closeAddMovieModal.addEventListener("click", () => closeModal(addMovieModal));
closeMovieDetailsModal.addEventListener("click", () => closeModal(movieDetailsModal));

window.addEventListener("click", (event) => {
  if (event.target === addMovieModal) closeModal(addMovieModal);
  if (event.target === movieDetailsModal) closeModal(movieDetailsModal);
});

window.addEventListener("dragend", clearDragState);
window.addEventListener("mouseup", clearDragState);

fetchMovies();

window.openMovieDetails = openMovieDetails;
window.setWatched = setWatched;
window.toggleWatched = toggleWatched;
window.setTier = setTier;
window.editMovie = editMovie;
window.deleteMovie = deleteMovie;
window.handleDragStart = handleDragStart;
window.handleDragOver = handleDragOver;
window.handleDragLeave = handleDragLeave;
window.handleDropToTier = handleDropToTier;
window.handleDropToPool = handleDropToPool;
