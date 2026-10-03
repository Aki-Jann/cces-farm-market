import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase/firestore'
import styles from './ProductRating.module.css'

type Review = {
  id: string
  rating: number
  comment: string
  createdAt: number
}

function formatReviewDate(timestamp: number) {
  return timestamp ? new Date(timestamp).toLocaleDateString() : ''
}

export function ProductRating({ productId, showReviews = false }: { productId?: string; showReviews?: boolean }) {
  const [rating, setRating] = useState<{ average: number; count: number } | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [hasError, setHasError] = useState(false)
  const [areReviewsOpen, setAreReviewsOpen] = useState(false)
  const reviewsButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!productId) return

    const unsubscribe = onSnapshot(
      collection(db, 'products', productId, 'reviews'),
      (snapshot) => {
        const loadedReviews = snapshot.docs.flatMap((review) => {
          const data = review.data()
          if (typeof data.rating !== 'number' || !Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5) return []
          const createdAt = data.createdAt && typeof data.createdAt === 'object' && 'toMillis' in data.createdAt
            && typeof data.createdAt.toMillis === 'function'
            ? data.createdAt.toMillis()
            : data.createdAt && typeof data.createdAt === 'object' && 'seconds' in data.createdAt
              && typeof data.createdAt.seconds === 'number'
              ? data.createdAt.seconds * 1000
              : 0
          return [{
            id: review.id,
            rating: data.rating,
            comment: typeof data.comment === 'string' ? data.comment.trim() : '',
            createdAt,
          }]
        }).sort((a, b) => b.createdAt - a.createdAt)
        const scores = loadedReviews.map((review) => review.rating)
        const total = scores.reduce((sum, score) => sum + score, 0)
        setReviews(loadedReviews)
        setRating({ average: scores.length ? total / scores.length : 0, count: scores.length })
        setHasError(false)
      },
      (error) => {
        console.error('Loading product ratings failed:', error)
        setHasError(true)
      }
    )

    return () => unsubscribe()
  }, [productId])

  useEffect(() => {
    if (!areReviewsOpen) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setAreReviewsOpen(false)
        reviewsButtonRef.current?.focus()
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [areReviewsOpen])

  if (!productId) {
    return (
      <span className={styles.rating} aria-label="No product ratings yet">
        <span aria-hidden="true" className={styles.stars}>☆☆☆☆☆</span>
        <small>No reviews</small>
      </span>
    )
  }
  if (hasError) return <small className={styles.ratingError}>Ratings unavailable</small>
  if (!rating) return <small className={styles.ratingLoading}>Loading ratings...</small>

  const filledStars = Math.round(rating.average)
  const titleId = `product-reviews-title-${productId}`
  return (
    <div className={styles.ratingBlock}>
      {showReviews ? (
        <>
          <button
            className={styles.ratingTrigger}
            type="button"
            ref={reviewsButtonRef}
            aria-expanded={areReviewsOpen}
            aria-label={rating.count
              ? `Read ${rating.count} reviews. Rated ${rating.average.toFixed(1)} out of 5`
              : 'Read product reviews. No reviews yet'}
            onClick={(event) => {
              event.stopPropagation()
              setAreReviewsOpen(true)
            }}
          >
            <span aria-hidden="true" className={styles.stars}>
              {Array.from({ length: 5 }, (_, index) => index < filledStars ? '★' : '☆').join('')}
            </span>
            <small>{rating.count ? `${rating.average.toFixed(1)} (${rating.count})` : 'No reviews'}</small>
          </button>
          {areReviewsOpen && (
            createPortal(
              <div
                className={styles.reviewsOverlay}
                onClick={(event) => {
                  if (event.target === event.currentTarget) setAreReviewsOpen(false)
                }}
              >
                <section className={styles.reviewsDialog} role="dialog" aria-modal="true" aria-labelledby={titleId}>
                  <header className={styles.reviewsHeader}>
                    <div>
                      <span className={styles.dialogEyebrow}>CUSTOMER FEEDBACK</span>
                      <h2 id={titleId}>Product reviews</h2>
                      <p><span className={styles.stars} aria-hidden="true">{'★'.repeat(filledStars)}{'☆'.repeat(5 - filledStars)}</span> {rating.average.toFixed(1)} · {rating.count} {rating.count === 1 ? 'review' : 'reviews'}</p>
                    </div>
                    <button
                      className={styles.closeReviews}
                      type="button"
                      aria-label="Close product reviews"
                      onClick={() => {
                        setAreReviewsOpen(false)
                        reviewsButtonRef.current?.focus()
                      }}
                    >×</button>
                  </header>
                  <div className={styles.reviewList}>
                    {reviews.length ? reviews.map((review) => (
                        <article className={styles.review} key={review.id}>
                          <div>
                            <span aria-label={`${review.rating} out of 5 stars`} className={styles.reviewStars}>
                              {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
                            </span>
                            {review.createdAt > 0 && <time dateTime={new Date(review.createdAt).toISOString()}>{formatReviewDate(review.createdAt)}</time>}
                          </div>
                          <p>{review.comment || 'No written comment.'}</p>
                        </article>
                      )) : (
                        <p className={styles.emptyReviews}>No reviews yet. Be the first to share your experience.</p>
                      )}
                  </div>
                </section>
              </div>,
              document.body
            )
          )}
        </>
      ) : (
        <span className={styles.rating} aria-label={rating.count
          ? `Rated ${rating.average.toFixed(1)} out of 5 from ${rating.count} reviews`
          : 'No product ratings yet'}
        >
          <span aria-hidden="true" className={styles.stars}>
            {Array.from({ length: 5 }, (_, index) => index < filledStars ? '★' : '☆').join('')}
          </span>
          <small>{rating.count ? `${rating.average.toFixed(1)} (${rating.count})` : 'No reviews'}</small>
        </span>
      )}
    </div>
  )
}
