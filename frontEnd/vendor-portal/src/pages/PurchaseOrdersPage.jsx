import {useEffect,useMemo,useState} from "react";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Search,
  ShoppingCart
} from "lucide-react";
import {useNavigate} from "react-router-dom";
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

export default function PurchaseOrdersPage(){
  const companyId=getCompanyId();
  const nav=useNavigate();

  const [session,setSession]=useState(null);
  const [rows,setRows]=useState([]);
  const [search,setSearch]=useState("");
  const [status,setStatus]=useState("");
  const [error,setError]=useState("");

  async function load(){
    const [ctx,data]=await Promise.all([
      portalApi.session(companyId),
      portalApi.purchaseOrders(companyId)
    ]);

    setSession(ctx);
    setRows(data.rows||[]);
  }

  useEffect(()=>{
    load().catch(err=>
      setError(err.message)
    );
  },[]);

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();

    return rows.filter(row=>{
      if(
        status
        &&row.status!==status
        &&row.vendor_acknowledgement_status!==status
      ){
        return false;
      }

      if(!q) return true;

      return [
        row.po_no,
        row.request_no,
        row.request_title,
        row.status,
        row.vendor_acknowledgement_status
      ].some(value=>
        String(value||"")
          .toLowerCase()
          .includes(q)
      );
    });
  },[rows,search,status]);

  const pendingAcknowledgement=
    rows.filter(row=>
      row.vendor_acknowledgement_status==="pending"
    ).length;

  const accepted=
    rows.filter(row=>
      row.vendor_acknowledgement_status==="accepted"
    ).length;

  if(!session)
    return (
      <div className="portal-loading">
        Loading purchase orders…
      </div>
    );

  return (
    <PortalShell
      session={session}
      active="orders"
    >
      <div className="vendor-portal-page-header">
        <div>
          <span className="portal-eyebrow">
            CUSTOMER ORDERS
          </span>

          <h1>Purchase orders</h1>

          <p>
            Review purchase orders issued to your organisation and acknowledge them securely.
          </p>
        </div>
      </div>

      {error&&(
        <div className="portal-alert error">
          {error}
        </div>
      )}

      <div className="vendor-po-stat-grid">
        <article className="vendor-po-stat">
          <ShoppingCart size={18}/>

          <div>
            <span>Total purchase orders</span>
            <strong>{rows.length}</strong>
          </div>
        </article>

        <article className="vendor-po-stat">
          <Clock3 size={18}/>

          <div>
            <span>Awaiting acknowledgement</span>
            <strong>
              {pendingAcknowledgement}
            </strong>
          </div>
        </article>

        <article className="vendor-po-stat">
          <CheckCircle2 size={18}/>

          <div>
            <span>Accepted</span>
            <strong>
              {accepted}
            </strong>
          </div>
        </article>
      </div>

      <section className="vendor-po-workspace">
        <div className="vendor-po-toolbar">
          <div className="vendor-po-search">
            <Search size={16}/>

            <input
              value={search}
              onChange={e=>
                setSearch(e.target.value)
              }
              placeholder="Search PO number or request"
            />
          </div>

          <select
            value={status}
            onChange={e=>
              setStatus(e.target.value)
            }
          >
            <option value="">
              All purchase orders
            </option>

            <option value="pending">
              Awaiting acknowledgement
            </option>

            <option value="accepted">
              Accepted
            </option>

            <option value="rejected">
              Rejected
            </option>

            <option value="partially_received">
              Partially received
            </option>

            <option value="received">
              Received
            </option>

            <option value="closed">
              Closed
            </option>
          </select>
        </div>

        {!filtered.length?(
          <div className="vendor-empty">
            <FileCheck2/>

            <h3>
              No purchase orders
            </h3>

            <p>
              Purchase orders issued to your organisation will appear here.
            </p>
          </div>
        ):(
          <div className="vendor-po-list">
            {filtered.map(row=>(
              <button
                type="button"
                className="vendor-po-row"
                key={row.id}
                onClick={()=>
                  nav(
                    `/purchase-orders/${row.id}`
                  )
                }
              >
                <div className="vendor-po-row-icon">
                  <ShoppingCart size={17}/>
                </div>

                <div className="vendor-po-row-main">
                  <span>
                    {row.po_no}
                  </span>

                  <strong>
                    {row.request_title||
                     row.request_no||
                     "Purchase order"}
                  </strong>

                  <small>
                    Issued {
                      row.issued_at
                        ?new Date(
                          row.issued_at
                        ).toLocaleDateString()
                        :"—"
                    }
                  </small>
                </div>

                <div className="vendor-po-row-date">
                  <span>
                    Expected delivery
                  </span>

                  <strong>
                    {row.expected_delivery_date
                      ?new Date(
                        row.expected_delivery_date
                      ).toLocaleDateString()
                      :"—"}
                  </strong>
                </div>

                <div className="vendor-po-row-amount">
                  <span>Amount</span>

                  <strong>
                    {money(
                      row.total_amount,
                      row.currency_code
                    )}
                  </strong>
                </div>

                <span
                  className={`portal-status ${
                    row.vendor_acknowledgement_status
                  }`}
                >
                  {String(
                    row.vendor_acknowledgement_status||
                    row.status
                  ).replaceAll("_"," ")}
                </span>

                <ArrowRight size={16}/>
              </button>
            ))}
          </div>
        )}
      </section>
    </PortalShell>
  );
}