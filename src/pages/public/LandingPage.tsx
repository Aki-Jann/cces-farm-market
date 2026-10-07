import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { BrandLogo } from '../../components/common/BrandLogo'
import { ProductRating } from '../../components/common/ProductRating'
import { db } from '../../firebase/firestore'
import styles from './LandingPage.module.css'
import heroImage from '../../assets/landing-temp.png'
import appleImage from '../../assets/apple.png'
import pepperImage from '../../assets/bell-pepper.png'
import cornImage from '../../assets/corn.png'
import gumamelaImage from '../../assets/gumamela.png'
import storyImage from '../../assets/our-story.png'

const products = [
  { name: 'APPLE', category: 'FRUITS', image: appleImage },
  { name: 'BELL PEPPER', category: 'VEGETABLES', image: pepperImage },
  { name: 'CORN', category: 'GRAINS', image: cornImage },
  { name: 'GUMAMELA', category: 'FLOWERS', image: gumamelaImage },
]

export function LandingPage() {
  const [soldCounts, setSoldCounts] = useState<Record<string, number> | null>(null)
  const [productIds, setProductIds] = useState<Record<string, string>>({})
  const [salesError, setSalesError] = useState(false)

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'products'),
      (snapshot) => {
        const counts: Record<string, number> = {}
        const ids: Record<string, string> = {}
        snapshot.docs.forEach((product) => {
          const data = product.data()
          if (typeof data.name !== 'string') return
          const name = data.name.trim().toUpperCase()
          ids[name] = product.id
          counts[name] = typeof data.sold === 'number' && Number.isFinite(data.sold)
            ? data.sold
            : 0
        })
        setSoldCounts(counts)
        setProductIds(ids)
        setSalesError(false)
      },
      (error) => {
        console.error('Loading product sales failed:', error)
        setSalesError(true)
      }
    )

    return () => unsubscribe()
  }, [])

  return (
    <main className={styles.landing} id="top">
      <header className={styles.header}>
        <a href="#top" aria-label="GreenMarket home"><BrandLogo compact /></a>
        <nav>
          <a href="#shops">Shop</a>
          <a href="#steps">Steps</a>
          <a href="#community">Community</a>
          <a href="#about">About</a>
          <a href="#faq">FAQ</a>
          <a href="#/login" className={styles.loginLink}>Log in</a>
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
          <a href="#shops">SHOP THIS WEEK’S HARVEST</a>
        </div>
      </section>

      <section className={styles.promise}>
        <span>Harvested daily<br /><small>Picked at peak ripeness</small></span>
        <span>No pesticides<br /><small>Naturally grown</small></span>
        <span>Pickup Sat–Sun<br /><small>8am – 1pm at the farm</small></span>
        <span>Direct orders<br /><small>Online pre-order available</small></span>
      </section>

      <section className={styles.products} id="shops">
        <h2>Connecting Zamboanga Farmers and Buyers<br />Through Smart Commerce</h2>
        <div className={styles.productGrid}>
          {products.map((product) => (
            <article className={styles.productCard} key={product.name}>
              <img src={product.image} alt={product.name} />
              <div className={styles.productInfo}>
                <div>
                  <strong>{product.name}</strong>
                  <small>{product.category}</small>
                  <small className={styles.soldText}>
                    {salesError
                      ? 'Sales unavailable'
                      : soldCounts
                        ? `${soldCounts[product.name] ?? 0} sold`
                        : 'Loading sales…'}
                  </small>
                  <ProductRating productId={productIds[product.name]} />
                </div>
                <div className={styles.price}><strong>₱100.00</strong><small>PER KG</small></div>
              </div>
              <button type="button" onClick={() => { window.location.hash = '/login' }}>ADD TO CART</button>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.howItWorks} id="steps">
        <p className={styles.sectionEyebrow}>FROM FARM TO YOUR TABLE</p>
        <h2>Fresh food, in a few simple steps</h2>
        <div className={styles.stepGrid}>
          <article className={styles.stepCard}>
            <span>01</span>
            <h3>Explore the harvest</h3>
            <p>Browse seasonal produce and see what local growers have available.</p>
          </article>
          <article className={styles.stepCard}>
            <span>02</span>
            <h3>Place your order</h3>
            <p>Add your favorites to the cart and choose pickup or delivery at checkout.</p>
          </article>
          <article className={styles.stepCard}>
            <span>03</span>
            <h3>Enjoy local freshness</h3>
            <p>Collect your order or have it delivered, then share feedback with the farm.</p>
          </article>
        </div>
        <a className={styles.sectionButton} href="#shops">EXPLORE THE HARVEST</a>
      </section>

      <section className={styles.community} id="community">
        <div className={styles.communityCopy}>
          <p className={styles.sectionEyebrow}>GROWN CLOSE TO HOME</p>
          <h2>Every order helps local farming grow</h2>
          <p>GreenMarket brings growers and buyers together in one place. Find seasonal produce, connect directly with the farm, and make local shopping part of your routine.</p>
          <a href="#about">MEET THE FARMING COMMUNITY</a>
        </div>
        <div className={styles.communityNote}>
          <span aria-hidden="true">“</span>
          <blockquote>Buying nearby makes it easier to know where our food comes from and who grew it.</blockquote>
          <small>Sample community note — illustrative content</small>
        </div>
      </section>

      <section className={styles.story} id="about">
        <h2>AGRICULTORES DE LA PAZ</h2>
        <p className={styles.storyLabel}>OUR STORY</p>
        <img src={storyImage} alt="Agricultores de la Paz community" />
        <p className={styles.storyText}>We are the Agricultores De La Paz, a community of growers working together to bring our harvest directly to buyers. Farming is our livelihood, but selling our produce has always been a challenge. Through this platform, we can share our crops at fair prices, reduce waste, and reach more people who value fresh, local food.</p>
        <button type="button" onClick={() => { window.location.hash = '/login' }}>ORDER DIRECTLY FROM US</button>
      </section>

      <section className={styles.faq} id="faq">
        <p className={styles.sectionEyebrow}>GOOD TO KNOW</p>
        <h2>Frequently asked questions</h2>
        <div className={styles.faqList}>
          <details>
            <summary>How do I place an order?</summary>
            <p>Create an account, browse the shop, add products to your cart, then select pickup or delivery at checkout.</p>
          </details>
          <details>
            <summary>When can I pick up my order?</summary>
            <p>Available pickup days and hours are shown in checkout and may vary based on the farm’s current schedule.</p>
          </details>
          <details>
            <summary>Can I pay online?</summary>
            <p>Where available, checkout shows the seller’s supported online payment options and payment instructions.</p>
          </details>
        </div>
      </section>

      <footer>
        <div className={styles.logo}>
          <BrandLogo compact />
        </div>
        <div className={styles.details}>
          <span>cces@adzu.edu.ph</span>
          <span>+63 992 091 8674</span>
          <span>Ateneo de Zamboanga University, La Purisima St., Zamboanga City 7000, Philippines</span>
        </div>
      </footer>
    </main> 
  )
}
