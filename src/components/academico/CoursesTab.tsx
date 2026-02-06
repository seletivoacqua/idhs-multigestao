import { useState, useEffect } from 'react';
import { Plus, BookOpen, List, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Course {
  id: string;
  name: string;
  teacher_name: string;
  workload: number;
  modality: 'EAD' | 'VIDEOCONFERENCIA';
  created_at: string;
  modules?: CourseModule[];
}

interface CourseModule {
  id?: string;
  name: string;
  order_number: number;
}

export function CoursesTab() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    teacher_name: '',
    workload: '',
    modality: 'VIDEOCONFERENCIA' as 'EAD' | 'VIDEOCONFERENCIA',
  });

  const [modules, setModules] = useState<CourseModule[]>([]);
  const [newModuleName, setNewModuleName] = useState('');

  useEffect(() => {
    loadCourses();
  }, []);

  const loadCourses = async () => {
    if (!user) return;

    const { data: coursesData, error: coursesError } = await supabase
      .from('courses')
      .select('*')
      .eq('user_id', user.id)
      .order('name');

    if (coursesError) {
      console.error('Error loading courses:', coursesError);
      return;
    }

    const coursesWithModules = await Promise.all(
      (coursesData || []).map(async (course) => {
        const { data: modulesData } = await supabase
          .from('course_modules')
          .select('*')
          .eq('course_id', course.id)
          .order('order_number');

        return { ...course, modules: modulesData || [] };
      })
    );

    setCourses(coursesWithModules);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    let courseId: string;

    if (editingCourse) {
      const { error } = await supabase
        .from('courses')
        .update({
          name: formData.name,
          teacher_name: formData.teacher_name,
          workload: parseInt(formData.workload),
          modality: formData.modality,
        })
        .eq('id', editingCourse.id);

      if (error) {
        console.error('Error updating course:', error);
        alert('Erro ao atualizar curso');
        return;
      }
      courseId = editingCourse.id;

      await supabase.from('course_modules').delete().eq('course_id', courseId);
    } else {
      const { data, error } = await supabase.from('courses').insert([
        {
          user_id: user.id,
          name: formData.name,
          teacher_name: formData.teacher_name,
          workload: parseInt(formData.workload),
          modality: formData.modality,
        },
      ]).select();

      if (error || !data) {
        console.error('Error adding course:', error);
        alert('Erro ao adicionar curso');
        return;
      }
      courseId = data[0].id;
    }

    if (modules.length > 0) {
      const modulesToInsert = modules.map((module, index) => ({
        course_id: courseId,
        name: module.name,
        order_number: index + 1,
      }));

      const { error: modulesError } = await supabase
        .from('course_modules')
        .insert(modulesToInsert);

      if (modulesError) {
        console.error('Error saving modules:', modulesError);
        alert('Erro ao salvar módulos');
        return;
      }
    }

    resetForm();
    loadCourses();
  };

  const resetForm = () => {
    setShowModal(false);
    setEditingCourse(null);
    setFormData({
      name: '',
      teacher_name: '',
      workload: '',
      modality: 'VIDEOCONFERENCIA',
    });
    setModules([]);
    setNewModuleName('');
  };

  const handleEdit = (course: Course) => {
    setEditingCourse(course);
    setFormData({
      name: course.name,
      teacher_name: course.teacher_name,
      workload: course.workload.toString(),
      modality: course.modality,
    });
    setModules(course.modules || []);
    setShowModal(true);
  };

  const handleAddModule = () => {
    if (!newModuleName.trim()) return;
    setModules([...modules, { name: newModuleName, order_number: modules.length + 1 }]);
    setNewModuleName('');
  };

  const handleRemoveModule = (index: number) => {
    setModules(modules.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-800">Cursos</h2>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Novo Curso</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {courses.map((course) => (
          <div
            key={course.id}
            className="bg-white border border-slate-200 rounded-lg p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <BookOpen className="w-6 h-6 text-green-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-800 mb-1">{course.name}</h3>
                <div className="space-y-1 text-sm text-slate-600">
                  <p>Professor: {course.teacher_name}</p>
                  <p>Carga Horária: {course.workload}h</p>
                  {course.modules && course.modules.length > 0 && (
                    <p className="flex items-center space-x-1">
                      <List className="w-4 h-4" />
                      <span>{course.modules.length} {course.modules.length === 1 ? 'módulo' : 'módulos'}</span>
                    </p>
                  )}
                  <span
                    className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                      course.modality === 'EAD'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {course.modality === 'EAD' ? 'EAD 24h' : 'Videoconferência'}
                  </span>
                </div>
                <button
                  onClick={() => handleEdit(course)}
                  className="text-sm text-green-600 hover:text-green-700 font-medium mt-2"
                >
                  Editar
                </button>
              </div>
            </div>
          </div>
        ))}
        {courses.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-500">
            <BookOpen className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p>Nenhum curso cadastrado</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-slate-800 mb-4">
              {editingCourse ? 'Editar Curso' : 'Novo Curso'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Nome do Curso</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Nome do Professor</label>
                <input
                  type="text"
                  value={formData.teacher_name}
                  onChange={(e) => setFormData({ ...formData, teacher_name: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Carga Horária</label>
                <input
                  type="number"
                  value={formData.workload}
                  onChange={(e) => setFormData({ ...formData, workload: e.target.value })}
                  required
                  min="1"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Modalidade</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, modality: 'VIDEOCONFERENCIA' })}
                    className={`py-2 rounded-lg font-medium transition-colors ${
                      formData.modality === 'VIDEOCONFERENCIA'
                        ? 'bg-amber-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Videoconferência
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, modality: 'EAD' })}
                    className={`py-2 rounded-lg font-medium transition-colors ${
                      formData.modality === 'EAD'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    EAD 24h
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Módulos</label>
                <div className="flex space-x-2 mb-3">
                  <input
                    type="text"
                    value={newModuleName}
                    onChange={(e) => setNewModuleName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddModule();
                      }
                    }}
                    placeholder="Nome do módulo"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={handleAddModule}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>

                {modules.length > 0 && (
                  <div className="border border-slate-200 rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                    {modules.map((module, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-lg"
                      >
                        <div className="flex items-center space-x-3">
                          <span className="flex items-center justify-center w-6 h-6 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                            {index + 1}
                          </span>
                          <span className="text-sm text-slate-700">{module.name}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveModule(index)}
                          className="text-red-600 hover:text-red-800 p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {modules.length === 0 && (
                  <p className="text-sm text-slate-500 italic">Nenhum módulo adicionado</p>
                )}
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
                  {editingCourse ? 'Atualizar' : 'Adicionar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
