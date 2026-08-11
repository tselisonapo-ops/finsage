import {BrowserRouter,Navigate,Route,Routes} from "react-router-dom";
import {getCompanyId,getToken} from "./api/api";

import SignInPage from "./pages/SignInPage";
import AcceptInvitePage from "./pages/AcceptInvitePage";
import SetupPage from "./pages/SetupPage";

import DashboardPage from "./pages/DashboardPage";
import PeoplePage from "./pages/PeoplePage";
import OrganisationPage from "./pages/OrganisationPage";
import GovernancePage from "./pages/GovernancePage";
import SettingsPage from "./pages/SettingsPage";

import RequestsPage from "./pages/RequestsPage";
import RequestPage from "./pages/RequestPage";
import ApprovalsPage from "./pages/ApprovalsPage";
import BudgetPage from "./pages/BudgetPage";

import ProcurementPage from "./pages/ProcurementPage";
import ProcurementPoliciesPage from "./pages/ProcurementPoliciesPage";
import ProcurementVendorsPage from "./pages/ProcurementVendorsPage";
import ProcurementSettingsPage from "./pages/ProcurementSettingsPage";

function Protected({children}){
  if(!getToken()||!getCompanyId()) return <Navigate to="/signin" replace/>;
  return children;
}

export default function App(){
  const basename=import.meta.env.PROD?"/ops":"/";

  return(
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/signin" element={<SignInPage/>}/>
        <Route path="/accept-invite" element={<AcceptInvitePage/>}/>

        <Route path="/" element={<Protected><DashboardPage/></Protected>}/>

        <Route path="/setup" element={<Protected><SetupPage/></Protected>}/>

        <Route path="/people" element={<Protected><PeoplePage/></Protected>}/>
        <Route path="/organisation" element={<Protected><OrganisationPage/></Protected>}/>
        <Route path="/governance" element={<Protected><GovernancePage/></Protected>}/>
        <Route path="/settings" element={<Protected><SettingsPage/></Protected>}/>

        <Route path="/requests" element={<Protected><RequestsPage/></Protected>}/>
        <Route path="/requests/new" element={<Protected><RequestPage/></Protected>}/>
        <Route path="/requests/:requestId" element={<Protected><RequestPage/></Protected>}/>

        <Route path="/approvals" element={<Protected><ApprovalsPage/></Protected>}/>
        <Route path="/budget" element={<Protected><BudgetPage/></Protected>}/>

        <Route path="/procurement" element={<Protected><ProcurementPage/></Protected>}/>
        <Route path="/procurement/policies" element={<Protected><ProcurementPoliciesPage/></Protected>}/>
        <Route path="/procurement/vendors" element={<Protected><ProcurementVendorsPage/></Protected>}/>
        <Route path="/procurement/settings" element={<Protected><ProcurementSettingsPage/></Protected>}/>

        <Route path="*" element={<Navigate to="/" replace/>}/>
      </Routes>
    </BrowserRouter>
  );
}