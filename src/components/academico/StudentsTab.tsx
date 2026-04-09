import { useState, useEffect, useRef } from 'react';
import { Plus, Search, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Unit {
  id: string;
  name: string;
}

interface Student {
  id: string;
  full_name: string;
  cpf: string;
  email: string;
  phone: string;
  unit_id: string;
  units?: {
    name: string;
  };
}

const PAGE_SIZE = 20;

export function StudentsTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const { user } = useAuth();
  const searchTimeout = useRef<NodeJS.Timeout>();

  const [formData, setFormData] = useState({
    full_name: '',
    cpf: '',
    email: '',
    phone: '',
    unit_id: '',
  });

  // Carregar unidades ao montar
  useEffect(() => {
    loadUnits();
  }, [user]);

  // Recarregar alunos quando o termo de busca mudar (reset)
  useEffect(() => {
    if (user) {
      loadStudents(true);
    }
  }, [searchTerm]);

  const loadUnits = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('units')
      .select('id, name')
      .eq('user_id', user.id)
      .order('name');

    if (error) {
      console.error('Erro ao carregar unidades:', error);
      return;
    }

    setUnits(data || []);
  };

  const loadStudents = async (reset = false) => {
    if (!user) return;

    const currentPage = reset ? 0 : page;
    if (reset) {
      setStudents([]);
      setPage(0);
      setHasMore(true);
    }

    setLoading(true);

    try {
      let query = supabase
        .from('students')
        .select('*, units(name)', { count: 'exact' })
        .eq('user_id', user.id)
        .order('full_name')
        .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

      if (searchTerm.trim()) {
        query = query.or(
          `full_name.ilike.%${searchTerm}%,cpf.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`
        );
      }

      const { data, error, count } = await query;

      if (error) throw error;

      setTotalCount(count || 0);

      if (reset) {
        setStudents(data || []);
      } else {
        setStudents((prev) => [...prev, ...(data || [])]);
      }

      const loadedCount = (reset ? data?.length : students.length + (data?.length || 0)) || 0;
      setHasMore(loadedCount < (count || 0));
      setPage(currentPage + 1);
    } catch (error: any) {
      console.error('Erro ao carregar alunos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearchTerm(value);
    }, 300);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      if (editingStudent) {
        const { error } = await supabase
          .from('students')
          .update({
            full_name: formData.full_name,
            cpf: formData.cpf,
            email: formData.email,
            phone: formData.phone,
            unit_id: formData.unit_id || null,
          })
          .eq('id', editingStudent.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('students').insert([
          {
            user_id: user.id,
            full_name: formData.full_name,
            cpf: formData.cpf,
            email: formData.email,
            phone: formData.phone,
            unit_id: formData.unit_id || null,
          },
        ]);

        if (error) throw error;
      }

      resetForm();
      loadStudents(true);
    } catch (error: any) {
      console.error('Erro ao salvar aluno:', error);
      if (error.code === '23505') {
        alert('Já existe um aluno com este CPF para sua conta.');
      } else {
        alert('Erro ao salvar aluno. Verifique os dados e tente novamente.');
      }
    }
  };

  const resetForm = () => {
    setShowModal(false);
    setEditingStudent(null);
    setFormData({
      full_name: '',
      cpf: '',
      email: '',
      phone: '',
      unit_id: '',
    });
  };

  const handleEdit = (student: Student) => {
    setEditingStudent(student);
    setFormData({
      full_name: student.full_name,
      cpf: student.cpf,
      email: student.email,
      phone: student.phone,
      unit_id: student.unit_id || '',
    });
    setShowModal(true);
  };

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      loadStudents(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <h2 className="text-xl font-semibold text-slate-800">Alunos</h2>
        <div className="flex gap-3">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              onChange={handleSearchChange}
              placeholder="Buscar por nome, CPF ou e-mail..."
              className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent w-full sm:w-80"
            />
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
          >
            <Plus className="w-5 h-5" />
            <span>Novo Aluno</span>
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Nome</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">CPF</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Telefone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Unidade</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {students.map((student) => (
                <tr key={student.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm text-slate-800 font-medium">{student.full_name}</td>
                  <td className="px-6 py-4 text-sm text-slate-700">{student.cpf}</td>
                  <td className="px-6 py-4 text-sm text-slate-700">{student.email}</td>
                  <td className="px-6 py-4 text-sm text-slate-700">{student.phone}</td>
                  <td className="px-6 py-4 text-sm text-slate-700">
                    {student.units?.name || '-'}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleEdit(student)}
                      className="text-green-600 hover:text-green-700 text-sm font-medium"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
              {students.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    {searchTerm ? 'Nenhum aluno encontrado' : 'Nenhum aluno cadastrado'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {hasMore && students.length > 0 && !loading && (
          <div className="px-6 py-4 border-t border-slate-200 text-center">
            <button
              onClick={handleLoadMore}
              className="px-4 py-2 text-sm text-green-600 hover:text-green-700 font-medium"
            >
              Carregar mais alunos
            </button>
          </div>
        )}

        {loading && students.length === 0 && (
          <div className="px-6 py-8 text-center text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin inline mr-2" />
            Carregando...
          </div>
        )}

        {!loading && students.length > 0 && totalCount > 0 && (
          <div className="px-6 py-3 border-t border-slate-200 text-sm text-slate-500 bg-slate-50">
            Mostrando {students.length} de {totalCount} aluno{totalCount !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-[95vw] sm:w-[85vw] md:w-[60vw] lg:w-[50vw] xl:w-[40vw] max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-slate-800 mb-4">
              {editingStudent ? 'Editar Aluno' : 'Novo Aluno'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Nome Completo *</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">CPF *</label>
                <input
                  type="text"
                  value={formData.cpf}
                  onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Telefone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Unidade *</label>
                <select
                  value={formData.unit_id}
                  onChange={(e) => setFormData({ ...formData, unit_id: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">Selecione uma unidade</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  {editingStudent ? 'Atualizar' : 'Adicionar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
