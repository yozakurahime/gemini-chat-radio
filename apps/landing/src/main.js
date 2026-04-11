import './styles.css';
import { SITE_CONTENT } from './content';

const hero = `
  <section class="hero">
    <div class="hero-copy">
      <p class="eyebrow">Academia Oxigenio</p>
      <h1>Treino, bem-estar e resultado em um ambiente que acolhe voce.</h1>
      <p class="subtitle">
        Conheca planos, modalidades e horarios. Comece sua jornada hoje com acompanhamento da equipe.
      </p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="${SITE_CONTENT.ctaEnrollmentUrl}" target="_blank" rel="noreferrer">Matricule-se</a>
        <a class="btn btn-ghost" href="${SITE_CONTENT.ctaStaffUrl}" target="_blank" rel="noreferrer">Area de atendimento</a>
      </div>
    </div>
    <div class="hero-panel">
      <h2>Horarios de funcionamento</h2>
      <ul>
        ${SITE_CONTENT.openingHours.map((item) => `<li>${item}</li>`).join('')}
      </ul>
      <p class="address">${SITE_CONTENT.address}</p>
      <a class="link" href="${SITE_CONTENT.mapUrl}" target="_blank" rel="noreferrer">Abrir no mapa</a>
    </div>
  </section>
`;

const plans = `
  <section id="planos" class="section">
    <div class="section-head">
      <h2>Planos para cada objetivo</h2>
      <p>Escolha o plano ideal e finalize sua matricula pelo site oficial.</p>
    </div>
    <div class="grid plans">
      ${SITE_CONTENT.plans
        .map(
          (plan) => `
        <article class="card">
          <p class="chip">${plan.highlight}</p>
          <h3>${plan.name}</h3>
          <p class="price">${plan.price}</p>
          <p>${plan.details}</p>
        </article>
      `
        )
        .join('')}
    </div>
  </section>
`;

const modalities = `
  <section id="modalidades" class="section">
    <div class="section-head">
      <h2>Modalidades</h2>
      <p>Opcoes para condicionamento, saude e performance.</p>
    </div>
    <div class="grid two">
      <article class="card">
        <h3>Praticas disponiveis</h3>
        <ul>
          ${SITE_CONTENT.modalities.map((modality) => `<li>${modality}</li>`).join('')}
        </ul>
      </article>
      <article class="card">
        <h3>Matricula e suporte</h3>
        <p>
          A matricula e presencial para validar vagas e horarios. Em caso de duvidas, fale com a equipe de recepcao
          ou acesse nosso Instagram oficial.
        </p>
        <a class="link" href="${SITE_CONTENT.instagramUrl}" target="_blank" rel="noreferrer">Ir para Instagram</a>
      </article>
    </div>
  </section>
`;

const structure = `
  <section id="estrutura" class="section">
    <div class="section-head">
      <h2>Estrutura da unidade</h2>
      <p>Imagens ilustrativas alinhadas com as modalidades oferecidas.</p>
    </div>
    <div class="gallery">
      ${SITE_CONTENT.gallery
        .map(
          (item) => `
        <figure class="gallery-item">
          <img src="${item.image}" alt="${item.title}" loading="lazy" />
          <figcaption>${item.title}</figcaption>
        </figure>
      `
        )
        .join('')}
    </div>
  </section>
`;

const faq = `
  <section id="faq" class="section">
    <div class="section-head">
      <h2>Perguntas frequentes</h2>
      <p>Informacoes rapidas para facilitar sua decisao.</p>
    </div>
    <div class="faq-list">
      ${SITE_CONTENT.faq
        .map(
          (item) => `
        <details class="faq-item">
          <summary>${item.q}</summary>
          <p>${item.a}</p>
        </details>
      `
        )
        .join('')}
    </div>
  </section>
`;

const footer = `
  <footer class="footer">
    <p><strong>${SITE_CONTENT.academyName}</strong> | ${SITE_CONTENT.address}</p>
    <div class="footer-actions">
      <a href="${SITE_CONTENT.ctaEnrollmentUrl}" target="_blank" rel="noreferrer">Matricula online</a>
      <a href="${SITE_CONTENT.ctaStaffUrl}" target="_blank" rel="noreferrer">Area de atendimento</a>
      <a href="${SITE_CONTENT.instagramUrl}" target="_blank" rel="noreferrer">Instagram</a>
    </div>
  </footer>
`;

document.querySelector('#app').innerHTML = `
  <div class="page-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-dot"></span>
        <strong>${SITE_CONTENT.academyName}</strong>
      </div>
      <nav>
        <a href="#planos">Planos</a>
        <a href="#modalidades">Modalidades</a>
        <a href="#estrutura">Estrutura</a>
        <a href="#faq">FAQ</a>
      </nav>
    </header>
    ${hero}
    ${plans}
    ${modalities}
    ${structure}
    ${faq}
    ${footer}
  </div>
`;
