const steps = ['Delivery Details', 'Review Order', 'Order Confirmation']

export default function CheckoutSteps({ current }) {
  return (
    <ol className="checkout-steps" aria-label="Checkout progress">
      {steps.map((label, index) => {
        const number = index + 1
        const complete = number < current

        return (
          <li key={label} className={complete ? 'is-complete' : undefined} aria-current={number === current ? 'step' : undefined}>
            <span>{complete ? '✓' : number}</span>
            {label}
          </li>
        )
      })}
    </ol>
  )
}
