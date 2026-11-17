import { Link } from 'react-router-dom'
import { formatDate } from '../../utils/format.js'
import { extractedLineCount, extractionSource, readExtracted } from './fields.js'

const textValue = (value) => (typeof value === 'string' && value.trim() ? value.trim() : 'Not available')

export default function ExtractionSummary({ purchaseOrder, extraction, showDetailLink = true }) {
  const data = readExtracted(purchaseOrder)
  const source = extractionSource(purchaseOrder, extraction)
  const count = extractedLineCount(purchaseOrder)
  const liveGemini = source.mock === false && source.provider.toLowerCase() === 'gemini'
  const mock = source.mock === true
  let bannerClass = 'extraction-unknown'
  let heading = 'Extraction'
  let fallbackNotice = 'Extraction source was not included in the response.'

  let sourceLabel = 'Not available'

  if (liveGemini) {
    bannerClass = 'extraction-live'
    heading = 'Live Gemini extraction'
    fallbackNotice = 'This purchase order was extracted by live Gemini.'
    sourceLabel = 'Live AI'
  } else if (mock) {
    bannerClass = 'extraction-mock'
    heading = 'Mock extraction'
    fallbackNotice = 'This purchase order was extracted by the mock provider, not live AI.'
    sourceLabel = 'Mock'
  }

  const poDate = data && typeof data.po_date === 'string' ? data.po_date : ''
  const poDateLabel = poDate ? (formatDate(poDate) || poDate) : 'Not available'

  return (
    <section className={`panel panel-wide page-stack ${bannerClass}`}>
      <div>
        <p className="eyebrow">{heading}</p>
        <h2>{textValue(data && data.po_number)}</h2>
        <p className="lede">{source.notice || fallbackNotice}</p>
      </div>
      <div className="summary-grid">
        <p>Supplier <strong>{textValue(data && data.supplier_name)}</strong></p>
        <p>PO date <strong>{poDateLabel}</strong></p>
        <p>Currency <strong>{textValue(data && data.currency)}</strong></p>
        <p>Provider <strong>{textValue(source.provider)}</strong></p>
        <p>Source <strong>{sourceLabel}</strong></p>
        <p>Extracted lines <strong>{count === null ? 'Not available' : count}</strong></p>
      </div>
      <p>Saved record {purchaseOrder.po_number}. Matches are not approved and no order is created.</p>
      {showDetailLink ? (
        <Link className="text-link" to={`/purchase-orders/${purchaseOrder.id}`}>View details</Link>
      ) : null}
    </section>
  )
}
