import {BrowserRouter,Navigate,Route,Routes} from "react-router-dom";
import {getCompanyId,getToken} from "./api/api";

import DashboardPage from "./pages/DashboardPage";
import InvitePage from "./pages/InvitePage";
import ProfilePage from "./pages/ProfilePage";
import RfqPage from "./pages/RfqPage";
import SignInPage from "./pages/SignInPage";
import PurchaseOrdersPage from "./pages/PurchaseOrdersPage";
import PurchaseOrderPage from "./pages/PurchaseOrderPage";
import InvoicesPage from "./pages/InvoicesPage";
import InvoicePage from "./pages/InvoicePage";
function Protected({children}){
  if(!getToken()||!getCompanyId())
    return <Navigate to="/signin" replace/>;

  return children;
}

export default function App(){
  const basename=
    import.meta.env.PROD
      ?"/vendor"
      :"/";

  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/invite" element={<InvitePage/>}/>
        <Route path="/signin" element={<SignInPage/>}/>

        <Route
          path="/"
          element={
            <Protected>
              <DashboardPage/>
            </Protected>
          }
        />

        <Route
          path="/rfqs/:eventId"
          element={
            <Protected>
              <RfqPage/>
            </Protected>
          }
        />

        <Route
          path="/profile"
          element={
            <Protected>
              <ProfilePage/>
            </Protected>
          }
        />

        <Route path="*" element={<Navigate to="/" replace/>}/>

        <Route path="/purchase-orders" element={<Protected><PurchaseOrdersPage/></Protected>}/>

        <Route path="/purchase-orders/:poId" element={<Protected><PurchaseOrderPage/></Protected>}/>
        <Route path="/invoices" element={<Protected><InvoicesPage/></Protected>}/>
        <Route path="/invoices/:invoiceId" element={<Protected><InvoicePage/></Protected>}/>
      </Routes>
    </BrowserRouter>
  );
}