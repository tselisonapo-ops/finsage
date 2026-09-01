import {useEffect,useState} from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  FileCheck2,
  MapPin,
  PackageCheck,
  ShieldCheck,
  ShoppingCart,
  X
} from "lucide-react";
import {useNavigate,useParams} from "react-router-dom";
import {
  getCompanyId,
  portalApi
} from "../api/api";
import PortalShell from "../components/PortalShell";

const money=(value,currency="")=>
  `${currency||""} ${Number(value||0).toLocaleString(undefined,{
    minimumFractionDigits:2,
    maximumFractionDigits:2
  })}`.trim();

export default function PurchaseOrderPage(){
  const companyId=getCompanyId();
  const {poId}=useParams();
  const nav=useNavigate();

  const [session,setSession]=useState(null);
  const [data,setData]=useState(null);

  const [comment,setComment]=useState("");
  const [showReject,setShowReject]=useState(false);

  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  async function load(){
    const [ctx,poData]=await Promise.all([
      portalApi.session(companyId),
      portalApi.purchaseOrder(
        companyId,
        poId
      )
    ]);

    setSession(ctx);
    setData(poData);

    setComment(
      poData.purchase_order
        ?.vendor_acknowledgement_comment
      ||""
    );
  }

  useEffect(()=>{
    load().catch(err=>
      setError(err.message)
    );
  },[poId]);

  async function acknowledge(decision){
    if(
      decision==="reject"
      &&!comment.trim()
    ){
      setError(
        "Please provide a reason for rejecting this purchase order."
      );
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");

    try{
      await portalApi.acknowledgePurchaseOrder(
        companyId,
        poId,
        decision,
        comment.trim()
      );

      await load();

      setShowReject(false);

      setSuccess(
        decision==="accept"
          ?"Purchase order accepted."
          :"Purchase order rejected and the customer has been notified."
      );

    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  if(!session||!data)
    return (
      <div className="portal-loading">
        Loading purchase order…
      </div>
    );

  const po=data.purchase_order;
  const lines=data.lines||[];

  const pending=
    po.vendor_acknowledgement_status
    ==="pending";

  const accepted=
    po.vendor_acknowledgement_status
    ==="accepted";

  const rejected=
    po.vendor_acknowledgement_status
    ==="rejected";

  return (
    <PortalShell
      session={session}
      active="orders"
    >
      <div className="vendor-portal-page-header">
        <div>
          <button
            type="button"
            className="portal-back"
            onClick={()=>
              nav("/purchase-orders")
            }
          >
            <ArrowLeft size={15}/>
            Purchase orders
          </button>

          <span className="portal-eyebrow">
            PURCHASE ORDER
          </span>

          <h1>{po.po_no}</h1>

          <p>
            Issued by {po.company_name}
          </p>
        </div>

        <span
          className={`portal-status ${
            po.vendor_acknowledgement_status
          }`}
        >
          {String(
            po.vendor_acknowledgement_status
          ).replaceAll("_"," ")}
        </span>
      </div>

      {error&&(
        <div className="portal-alert error">
          {error}
        </div>
      )}

      {success&&(
        <div className="portal-alert success">
          {success}
        </div>
      )}

      <div className="vendor-po-detail-workspace">
        <main className="vendor-po-detail-main">
          <section className="vendor-po-summary">
            <div>
              <span>PO date</span>

              <strong>
                {po.po_date
                  ?new Date(
                    po.po_date
                  ).toLocaleDateString()
                  :"—"}
              </strong>
            </div>

            <div>
              <span>
                Expected delivery
              </span>

              <strong>
                {po.expected_delivery_date
                  ?new Date(
                    po.expected_delivery_date
                  ).toLocaleDateString()
                  :"—"}
              </strong>
            </div>

            <div>
              <span>Currency</span>

              <strong>
                {po.currency_code||
                 session.company?.currency||
                 "—"}
              </strong>
            </div>

            <div>
              <span>Total</span>

              <strong>
                {money(
                  po.total_amount,
                  po.currency_code
                )}
              </strong>
            </div>
          </section>

          <section className="vendor-po-detail-section">
            <div className="vendor-section-title">
              <Building2 size={17}/>

              <div>
                <strong>
                  Customer
                </strong>

                <span>
                  Purchase order issuer
                </span>
              </div>
            </div>

            <div className="vendor-po-customer">
              {po.logo_url?(
                <img
                  src={po.logo_url}
                  alt=""
                />
              ):(
                <div className="vendor-po-customer-logo">
                  {po.company_name?.[0]?.toUpperCase()||"C"}
                </div>
              )}

              <div>
                <strong>
                  {po.company_name}
                </strong>

                <span>
                  {po.company_email||""}
                </span>

                <span>
                  {po.company_phone||""}
                </span>
              </div>
            </div>
          </section>

          <section className="vendor-po-detail-section">
            <div className="vendor-section-title">
              <ShoppingCart size={17}/>

              <div>
                <strong>
                  Order lines
                </strong>

                <span>
                  Goods or services ordered by the customer.
                </span>
              </div>
            </div>

            <div className="vendor-po-lines">
              <div className="vendor-po-lines-head">
                <span>#</span>
                <span>Description</span>
                <span>Qty</span>
                <span>Unit price</span>
                <span>Tax</span>
                <span>Total</span>
              </div>

              {lines.map(line=>(
                <div
                  className="vendor-po-lines-row"
                  key={line.id}
                >
                  <span>
                    {line.line_no}
                  </span>

                  <div>
                    <strong>
                      {line.description}
                    </strong>

                    {line.specification&&(
                      <small>
                        {line.specification}
                      </small>
                    )}
                  </div>

                  <span>
                    {Number(
                      line.quantity||0
                    ).toLocaleString()}
                    {" "}
                    {line.unit_of_measure||""}
                  </span>

                  <span>
                    {money(
                      line.unit_price,
                      po.currency_code
                    )}
                  </span>

                  <span>
                    {money(
                      line.tax_amount,
                      po.currency_code
                    )}
                  </span>

                  <strong>
                    {money(
                      line.line_total,
                      po.currency_code
                    )}
                  </strong>
                </div>
              ))}
            </div>

            <div className="vendor-po-totals">
              <div>
                <span>Subtotal</span>

                <strong>
                  {money(
                    po.subtotal,
                    po.currency_code
                  )}
                </strong>
              </div>

              <div>
                <span>Discount</span>

                <strong>
                  {money(
                    po.discount_amount,
                    po.currency_code
                  )}
                </strong>
              </div>

              <div>
                <span>Tax</span>

                <strong>
                  {money(
                    po.tax_amount,
                    po.currency_code
                  )}
                </strong>
              </div>

              <div>
                <span>Delivery</span>

                <strong>
                  {money(
                    po.delivery_amount,
                    po.currency_code
                  )}
                </strong>
              </div>

              <div className="total">
                <span>
                  Purchase order total
                </span>

                <strong>
                  {money(
                    po.total_amount,
                    po.currency_code
                  )}
                </strong>
              </div>
            </div>
          </section>

          <section className="vendor-po-detail-section">
            <div className="vendor-section-title">
              <MapPin size={17}/>

              <div>
                <strong>
                  Delivery
                </strong>

                <span>
                  Destination and delivery instructions.
                </span>
              </div>
            </div>

            <div className="vendor-po-address-card">
              <MapPin size={17}/>

              <div>
                <span>
                  Delivery address
                </span>

                <strong>
                  {po.delivery_address||
                   "Not specified"}
                </strong>
              </div>
            </div>
          </section>

          <section className="vendor-po-detail-section">
            <div className="vendor-section-title">
              <FileCheck2 size={17}/>

              <div>
                <strong>
                  Commercial terms
                </strong>

                <span>
                  Terms applying to this purchase order.
                </span>
              </div>
            </div>

            <div className="vendor-po-term-grid">
              <div>
                <span>Payment terms</span>

                <strong>
                  {po.payment_terms||
                   "Not specified"}
                </strong>
              </div>

              <div>
                <span>Delivery terms</span>

                <strong>
                  {po.delivery_terms||
                   "Not specified"}
                </strong>
              </div>

              <div>
                <span>Warranty</span>

                <strong>
                  {po.warranty_terms||
                   "Not specified"}
                </strong>
              </div>
            </div>

            {po.terms_text&&(
              <div className="vendor-po-terms-text">
                <strong>
                  Purchase order terms
                </strong>

                <p>
                  {po.terms_text}
                </p>
              </div>
            )}
          </section>
        </main>

        <aside className="vendor-po-action-panel">
          <div className="vendor-po-action-sticky">
            <span className="portal-eyebrow">
              ACKNOWLEDGEMENT
            </span>

            <h2>
              Purchase order response
            </h2>

            {pending&&(
              <>
                <p>
                  Confirm that your organisation has received this purchase order and can fulfil the order under the stated terms.
                </p>

                <div className="vendor-po-ack-warning">
                  <ShieldCheck size={17}/>

                  <span>
                    Accepting confirms receipt of the PO. It does not mark the goods or services as delivered.
                  </span>
                </div>

                <label>
                  Optional comment
                </label>

                <textarea
                  rows="5"
                  value={comment}
                  onChange={e=>
                    setComment(
                      e.target.value
                    )
                  }
                  placeholder="Add acknowledgement notes..."
                />

                <div className="vendor-po-action-buttons">
                  <button
                    type="button"
                    className="portal-reject"
                    disabled={busy}
                    onClick={()=>
                      setShowReject(true)
                    }
                  >
                    <X size={16}/>
                    Reject PO
                  </button>

                  <button
                    type="button"
                    className="portal-primary"
                    disabled={busy}
                    onClick={()=>
                      acknowledge("accept")
                    }
                  >
                    <Check size={16}/>

                    {busy
                      ?"Saving..."
                      :"Accept PO"}
                  </button>
                </div>
              </>
            )}

            {accepted&&(
              <div className="vendor-po-accepted-card">
                <CheckCircle2 size={24}/>

                <div>
                  <strong>
                    Purchase order accepted
                  </strong>

                  <span>
                    Acknowledged {
                      po.acknowledged_at
                        ?new Date(
                          po.acknowledged_at
                        ).toLocaleString()
                        :""
                    }
                  </span>

                  {po.vendor_acknowledgement_comment&&(
                    <p>
                      {po.vendor_acknowledgement_comment}
                    </p>
                  )}
                </div>
              </div>
            )}

            {rejected&&(
              <div className="vendor-po-rejected-card">
                <AlertTriangle size={23}/>

                <div>
                  <strong>
                    Purchase order rejected
                  </strong>

                  <p>
                    {po.vendor_acknowledgement_comment||
                     "No rejection reason was recorded."}
                  </p>
                </div>
              </div>
            )}

            <div className="vendor-po-next-step">
              <PackageCheck size={18}/>

              <div>
                <strong>
                  What happens next?
                </strong>

                <span>
                  Once goods are delivered or services are completed, the customer will perform receipt or service confirmation before invoice processing.
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {showReject&&(
        <div
          className="portal-modal-backdrop"
          onMouseDown={()=>
            setShowReject(false)
          }
        >
          <div
            className="portal-modal"
            onMouseDown={e=>
              e.stopPropagation()
            }
          >
            <AlertTriangle size={25}/>

            <h2>
              Reject purchase order?
            </h2>

            <p>
              Explain why your organisation cannot accept this purchase order. The customer procurement team will be able to review the reason.
            </p>

            <label>
              Rejection reason
            </label>

            <textarea
              rows="6"
              value={comment}
              onChange={e=>
                setComment(
                  e.target.value
                )
              }
              placeholder="Explain the issue with this purchase order..."
            />

            <div className="portal-modal-actions">
              <button
                type="button"
                className="portal-secondary"
                disabled={busy}
                onClick={()=>
                  setShowReject(false)
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="portal-reject"
                disabled={busy}
                onClick={()=>
                  acknowledge("reject")
                }
              >
                <X size={16}/>

                {busy
                  ?"Rejecting..."
                  :"Reject purchase order"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalShell>
  );
}