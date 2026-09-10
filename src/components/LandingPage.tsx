import { BrandLogo } from './BrandLogo'
import styles from './LandingPage.module.css'
import heroImage from '../assets/landing-hero.png'
import appleImage from '../assets/apple.png'
import pepperImage from '../assets/bell-pepper.png'
import cornImage from '../assets/corn.png'
import gumamelaImage from '../assets/gumamela.png'
import storyImage from '../assets/our-story.png'

const products = [
  { name: 'APPLE', category: 'FRUITS', image: appleImage },
  { name: 'BELL PEPPER', category: 'VEGETABLES', image: pepperImage },
  { name: 'CORN', category: 'GRAINS', image: cornImage },
  { name: 'GUMAMELA', category: 'FLOWERS', image: gumamelaImage },
]

export function LandingPage() {
  return (
    <main className={styles.landing}>
      <header className={styles.header}>
        <a href="#/" aria-label="GreenMarket home"><BrandLogo compact /></a>
        <nav>
          <a href="#shop">SHOP</a>
          <a href="#about">ABOUT</a>
          <a href="#/login" className={styles.loginLink}>LOG IN</a>
        </nav>
      </header>

      <section className={styles.hero}>
        <img src={heroImage} alt="Farmers harvesting fresh produce" />
        <h1>Source Locally,<br />Order Fresh</h1>
        <div className={styles.heroCard}>
          <p>Direct farm-to-market access with fair pricing, simple transactions, and community support.</p>
          <div className={styles.heroBenefits}>
            <span>● Fair Pricing</span>
            <span>● Direct Connection</span>
            <span>● Simple Communication</span>
          </div>
          <a href="#shop">SHOP THIS WEEK’S HARVEST</a>
        </div>
      </section>

      <section className={styles.promise}>
        <span>Harvested daily<br /><small>Picked at peak ripeness</small></span>
        <span>No pesticides<br /><small>Naturally grown</small></span>
        <span>Pickup Sat–Sun<br /><small>8am – 1pm at the farm</small></span>
        <span>Direct orders<br /><small>Online pre-order available</small></span>
      </section>

      <section className={styles.products} id="shop">
        <h2>Connecting Zamboanga Farmers and Buyers<br />Through Smart Commerce</h2>
        <div className={styles.productGrid}>
          {products.map((product) => (
            <article className={styles.productCard} key={product.name}>
              <img src={product.image} alt={product.name} />
              <div className={styles.productInfo}>
                <div><strong>{product.name}</strong><small>{product.category}</small></div>
                <div className={styles.price}><strong>₱100.00</strong><small>PER KG</small></div>
              </div>
              <button type="button">ADD TO CART</button>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.story} id="about">
        <h2>AGRICULTORES DE LA PAZ</h2>
        <p className={styles.storyLabel}>OUR STORY</p>
        <img src={storyImage} alt="Agricultores de la Paz community" />
        <p className={styles.storyText}>We are the Agricultores De La Paz, a community of growers working together to bring our harvest directly to buyers. Farming is our livelihood, but selling our produce has always been a challenge. Through this platform, we can share our crops at fair prices, reduce waste, and reach more people who value fresh, local food.</p>
        <button type="button">ORDER DIRECTLY FROM US</button>
      </section>

      <footer><BrandLogo compact /><span>cces@adzu.edu.ph</span><span>+63 992 091 8674</span><span>Ateneo de Zamboanga University, La Purisima St., Zamboanga City 7000, Philippines</span></footer>
    </main>
  )
}
