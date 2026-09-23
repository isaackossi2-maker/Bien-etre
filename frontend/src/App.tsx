import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { CallProvider } from "./call/CallContext";
import CallOverlay from "./call/CallOverlay";
import GroupCallOverlay from "./call/GroupCallOverlay";
import MeetingAlertBanner from "./call/MeetingAlert";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Profile from "./pages/Profile";
import Reunion from "./pages/Reunion";
import ReunionRoom from "./pages/ReunionRoom";
import Bible from "./pages/Bible";
import AdminLayout from "./layouts/AdminLayout";
import UserLayout from "./layouts/UserLayout";

import Dashboard from "./pages/admin/Dashboard";
import AdminUsers from "./pages/admin/Users";
import AdminExams from "./pages/admin/Exams";
import AdminExamQuestions from "./pages/admin/ExamQuestions";
import AdminMeditations from "./pages/admin/Meditations";
import AdminQuestions from "./pages/admin/Questions";
import AdminResults from "./pages/admin/Results";
import AdminLogs from "./pages/admin/Logs";

import UserDashboard from "./pages/user/Dashboard";
import UserMeditations from "./pages/user/Meditations";
import UserExams from "./pages/user/Exams";
import UserExamTake from "./pages/user/ExamTake";
import UserQuestions from "./pages/user/Questions";

function Home() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "ADMIN" ? "/admin" : "/app"} replace />;
}

export default function App() {
  return (
    <CallProvider>
      <CallOverlay />
      <GroupCallOverlay />
      <MeetingAlertBanner />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* La salle de réunion reste hors des layouts admin/utilisateur : le lien est
            partagé entre rôles et la vue plein écran suit le même schéma que les appels.
            Volontairement PAS derrière ProtectedRoute : un invité externe sans compte doit
            pouvoir l'ouvrir directement via le lien (ReunionRoom gère elle-même le cas où
            aucun utilisateur n'est connecté, en demandant juste un nom). */}
        <Route path="/reunion/:id" element={<ReunionRoom />} />

        {/* La session d'examen est hors layout : pas de sidebar accessible pendant
            l'épreuve, condition nécessaire au verrouillage de l'écran. */}
        <Route element={<ProtectedRoute allowedRoles={["USER", "ADMIN"]} />}>
          <Route path="/exam-session/:id" element={<UserExamTake />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={["ADMIN"]} />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="exams" element={<AdminExams />} />
            <Route path="exams/:id/questions" element={<AdminExamQuestions />} />
            <Route path="meditations" element={<AdminMeditations />} />
            <Route path="questions" element={<AdminQuestions />} />
            <Route path="results" element={<AdminResults />} />
            <Route path="logs" element={<AdminLogs />} />
            <Route path="reunion" element={<Reunion />} />
            <Route path="bible" element={<Bible />} />
            <Route path="profile" element={<Profile />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={["USER", "ADMIN"]} />}>
          <Route path="/app" element={<UserLayout />}>
            <Route index element={<UserDashboard />} />
            <Route path="meditations" element={<UserMeditations />} />
            <Route path="exams" element={<UserExams />} />
            <Route path="questions" element={<UserQuestions />} />
            <Route path="reunion" element={<Reunion />} />
            <Route path="bible" element={<Bible />} />
            <Route path="profile" element={<Profile />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </CallProvider>
  );
}
