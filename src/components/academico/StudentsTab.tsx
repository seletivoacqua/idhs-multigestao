import { useState, useEffect } from 'react';
import { Plus, Search } from 'lucide-react';
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

export function StudentsTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    full_name: '',
    cpf: '',
    email: '',
    phone: '',
    unit_id: '',
  });

  useEffect(() => {
    loadUnits();
    loadStudents();
  }, []);

  const loadUnits = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('units')
      .select('id, name')
      .eq('user_id', user.id)
      .order('name');

    if (error) {
      console.error('Error loading units:', error);
      return;
    }

    setUnits(data || []);
  };

  const loadStudents = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('students')
      .select('*, units(name)')
      .eq('user_id', user.id)
      .order('full_name');

    if (error) {
      console.error('Error loading students:', error);
      return;
    }

    setStudents(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

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

      if (error) {
        console.error('Error updating student:', error);
        alert('Erro ao atualizar aluno');
        return;
      }
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

      if (error) {
        console.error('Error adding student:', error);
        alert('Erro ao adicionar aluno');
        return;
      }
    }

    resetForm();
    loadStudents();
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

  const filteredStudents = students.filter(
    (student) =>
      student.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.cpf.includes(searchTerm) ||
      student.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <h2 className="text-xl font-semibold text-slate-800">Alunos</h2>
        <div className="flex gap-3">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar aluno..."
              className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent w-full sm:w-64"
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
              {filteredStudents.map((student) => (
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
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    {searchTerm ? 'Nenhum aluno encontrado' : 'Nenhum aluno cadastrado'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <h3 className="text-xl font-bold text-slate-800 mb-4">
              {editingStudent ? 'Editar Aluno' : 'Novo Aluno'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Nome Completo</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">CPF</label>
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
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Telefone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Unidade</label>
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
