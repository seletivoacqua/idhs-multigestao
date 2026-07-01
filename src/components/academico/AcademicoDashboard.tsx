import { useState } from 'react';
import { LogOut, Building2, Users, BookOpen, BarChart3, Calendar, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { UnitsTab } from './UnitsTab';
import { StudentsTab } from './StudentsTab';
import { CoursesTab } from './CoursesTab';
import { CyclesTab } from './CyclesTab';
import { ReportsTab } from './ReportsTab';
import logoImg from '../../assets/Gemini_Generated_Image_dimyf6dimyf6dimy-removebg-preview.png';

type Tab = 'units' | 'students' | 'courses' | 'cycles' | 'reports';

export function AcademicoDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('units');
  const { signOut, userName } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-blue-900 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <img src={logoImg} alt="IDHS" className="h-14 drop-shadow-md" />
              <div>
                <p className="text-blue-300 text-xs font-semibold uppercase tracking-widest">Sistema IDHS</p>
                <h1 className="text-xl font-bold text-white leading-tight">Módulo Acadêmico</h1>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {userName && (
                <div className="flex items-center space-x-2 px-4 py-2 bg-blue-800 rounded-lg border border-blue-700">
                  <User className="w-4 h-4 text-blue-300" />
                  <span className="text-white text-sm font-medium">{userName}</span>
                </div>
              )}
              <button
                onClick={handleSignOut}
                className="flex items-center space-x-2 px-4 py-2 text-blue-200 hover:text-white hover:bg-blue-800 rounded-lg transition-colors border border-transparent hover:border-blue-700"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm font-medium">Sair</span>
              </button>
            </div>
          </div>
        </div>
        <div className="h-1 bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500" />
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200">
            <nav className="flex space-x-1 p-2 overflow-x-auto">
              <button
                onClick={() => setActiveTab('units')}
                className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg font-medium transition-all whitespace-nowrap text-sm ${
                  activeTab === 'units'
                    ? 'bg-blue-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>Unidades</span>
              </button>
              <button
                onClick={() => setActiveTab('students')}
                className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg font-medium transition-all whitespace-nowrap text-sm ${
                  activeTab === 'students'
                    ? 'bg-blue-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Alunos</span>
              </button>
              <button
                onClick={() => setActiveTab('courses')}
                className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg font-medium transition-all whitespace-nowrap text-sm ${
                  activeTab === 'courses'
                    ? 'bg-blue-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                <span>Cursos</span>
              </button>
              <button
                onClick={() => setActiveTab('cycles')}
                className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg font-medium transition-all whitespace-nowrap text-sm ${
                  activeTab === 'cycles'
                    ? 'bg-blue-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                }`}
              >
                <Calendar className="w-4 h-4" />
                <span>Ciclos</span>
              </button>
              <button
                onClick={() => setActiveTab('reports')}
                className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg font-medium transition-all whitespace-nowrap text-sm ${
                  activeTab === 'reports'
                    ? 'bg-blue-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                <span>Relatórios</span>
              </button>
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'units' && <UnitsTab />}
            {activeTab === 'students' && <StudentsTab />}
            {activeTab === 'courses' && <CoursesTab />}
            {activeTab === 'cycles' && <CyclesTab />}
            {activeTab === 'reports' && <ReportsTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
