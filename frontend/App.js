import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";
import { Check, Edit3, Plus, RefreshCw, Save, Trash2, X } from "lucide-react-native";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4001";

export default function App() {
  const { width } = useWindowDimensions();
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [groupTitle, setGroupTitle] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [editingGroup, setEditingGroup] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) || null,
    [groups, selectedGroupId]
  );

  useEffect(() => {
    loadGroups();
  }, []);

  useEffect(() => {
    if (groups.length === 0) {
      setSelectedGroupId(null);
      return;
    }

    const selectedStillExists = groups.some((group) => group.id === selectedGroupId);
    if (!selectedGroupId || !selectedStillExists) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups, selectedGroupId]);

  useEffect(() => {
    if (!error) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setError("");
    }, 5000);

    return () => clearTimeout(timeoutId);
  }, [error]);

  async function api(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      ...options
    });

    if (!response.ok) {
      let message = "Nao foi possivel completar a acao.";
      try {
        const body = await response.json();
        message = body.error || message;
      } catch (_error) {
        // Keep the default message when the server has no JSON body.
      }
      throw new Error(message);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  function showError(message) {
    setError(message);
  }

  async function loadGroups() {
    try {
      setError("");
      setLoading(true);
      const data = await api("/groups");
      setGroups(data.groups);
    } catch (loadError) {
      showError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  async function createGroup() {
    const title = groupTitle.trim();
    if (!title) {
      return;
    }

    try {
      setSaving(true);
      setError("");
      const data = await api("/groups", {
        method: "POST",
        body: JSON.stringify({ title })
      });
      setGroups((current) => [...current, data.group]);
      setSelectedGroupId(data.group.id);
      setGroupTitle("");
    } catch (createError) {
      showError(createError.message);
    } finally {
      setSaving(false);
    }
  }

  function startEditGroup(group) {
    setEditingGroup({
      id: group.id,
      title: group.title
    });
  }

  async function saveGroupTitle() {
    const title = editingGroup?.title?.trim();
    if (!editingGroup || !title) {
      return;
    }

    try {
      setSaving(true);
      setError("");
      const data = await api(`/groups/${editingGroup.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title })
      });
      setGroups((current) =>
        current.map((group) =>
          group.id === data.group.id ? { ...group, title: data.group.title } : group
        )
      );
      setEditingGroup(null);
    } catch (updateError) {
      showError(updateError.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteGroup(groupId) {
    try {
      setSaving(true);
      setError("");
      await api(`/groups/${groupId}`, { method: "DELETE" });
      setGroups((current) => current.filter((group) => group.id !== groupId));
      if (selectedGroupId === groupId) {
        setSelectedGroupId(null);
      }
    } catch (deleteError) {
      showError(deleteError.message);
    } finally {
      setSaving(false);
    }
  }

  function requestDeleteGroup(group) {
    setConfirmDelete({
      type: "group",
      id: group.id,
      title: group.title
    });
  }

  async function createTask() {
    const title = taskTitle.trim();
    if (!title || !selectedGroup) {
      return;
    }

    const dueDate = parseDisplayDate(taskDueDate);
    if (dueDate === false) {
      showError("Use uma data de prazo valida no formato DD/MM/AAAA ou deixe em branco.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      const data = await api(`/groups/${selectedGroup.id}/tasks`, {
        method: "POST",
        body: JSON.stringify({
          title,
          dueDate
        })
      });
      setGroups((current) =>
        current.map((group) =>
          group.id === selectedGroup.id ? { ...group, tasks: [...group.tasks, data.task] } : group
        )
      );
      setTaskTitle("");
      setTaskDueDate("");
    } catch (createError) {
      showError(createError.message);
    } finally {
      setSaving(false);
    }
  }

  function startEditTask(task) {
    setEditingTask({
      id: task.id,
      title: task.title,
      dueDate: formatDueDateInput(task.dueDate)
    });
  }

  async function saveTaskEdit() {
    const title = editingTask?.title?.trim();
    if (!editingTask || !title) {
      return;
    }

    const dueDate = parseDisplayDate(editingTask.dueDate);
    if (dueDate === false) {
      showError("Use uma data de prazo valida no formato DD/MM/AAAA ou deixe em branco.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      const data = await api(`/tasks/${editingTask.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title,
          dueDate
        })
      });
      setGroups((current) => replaceTask(current, data.task));
      setEditingTask(null);
    } catch (updateError) {
      showError(updateError.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleTask(task) {
    const nextTask = { ...task, completed: !task.completed };
    setGroups((current) => replaceTask(current, nextTask));

    try {
      setError("");
      const data = await api(`/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ completed: nextTask.completed })
      });
      setGroups((current) => replaceTask(current, data.task));
    } catch (toggleError) {
      setGroups((current) => replaceTask(current, task));
      showError(toggleError.message);
    }
  }

  async function deleteTask(taskId) {
    try {
      setSaving(true);
      setError("");
      await api(`/tasks/${taskId}`, { method: "DELETE" });
      setGroups((current) =>
        current.map((group) => ({
          ...group,
          tasks: group.tasks.filter((task) => task.id !== taskId)
        }))
      );
    } catch (deleteError) {
      showError(deleteError.message);
    } finally {
      setSaving(false);
    }
  }

  function requestDeleteTask(task) {
    setConfirmDelete({
      type: "task",
      id: task.id,
      title: task.title
    });
  }

  async function confirmDeleteItem() {
    if (!confirmDelete) {
      return;
    }

    const item = confirmDelete;
    setConfirmDelete(null);

    if (item.type === "group") {
      await deleteGroup(item.id);
      return;
    }

    await deleteTask(item.id);
  }

  const completedCount = selectedGroup?.tasks.filter((task) => task.completed).length || 0;
  const taskCount = selectedGroup?.tasks.length || 0;
  const isNarrow = width < 780;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.appShell, isNarrow && styles.appShellNarrow]}>
        <View style={[styles.header, isNarrow && styles.headerNarrow]}>
          <View style={styles.titleBlock}>
            <Text style={[styles.title, isNarrow && styles.titleNarrow]}>Task Lists</Text>
            <Text style={styles.subtitle}>
              Listas compartilhadas para organizar o que precisa ser feito.
            </Text>
          </View>
          <Pressable
            style={[styles.iconButton, isNarrow && styles.iconButtonNarrow]}
            onPress={loadGroups}
            disabled={loading}
          >
            <RefreshCw size={18} color="#13201a" />
          </Pressable>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.errorClose} onPress={() => setError("")}>
              <X size={16} color="#a33636" />
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.content, isNarrow && styles.contentNarrow]}>
          <View style={[styles.sidebar, isNarrow && styles.sidebarNarrow]}>
            <Text style={styles.sectionTitle}>Listas</Text>
            <View style={styles.formRow}>
              <TextInput
                value={groupTitle}
                onChangeText={setGroupTitle}
                onSubmitEditing={createGroup}
                placeholder="Nova lista"
                placeholderTextColor="#7b8580"
                style={styles.input}
              />
              <Pressable style={styles.primaryIconButton} onPress={createGroup} disabled={saving}>
                <Plus size={18} color="#ffffff" />
              </Pressable>
            </View>

            <ScrollView style={styles.groupList} contentContainerStyle={styles.groupListContent}>
              {groups.map((group) => {
                const active = selectedGroup?.id === group.id;
                const remaining = group.tasks.filter((task) => !task.completed).length;

                return (
                  <Pressable
                    key={group.id}
                    style={[styles.groupItem, active && styles.groupItemActive]}
                    onPress={() => setSelectedGroupId(group.id)}
                  >
                    <View style={styles.groupText}>
                      <Text style={[styles.groupName, active && styles.groupNameActive]}>
                        {group.title}
                      </Text>
                      <Text style={styles.groupMeta}>
                        {remaining} pendente{remaining === 1 ? "" : "s"}
                      </Text>
                    </View>
                    <View style={styles.rowActions}>
                      <Pressable style={styles.smallAction} onPress={() => startEditGroup(group)}>
                        <Edit3 size={15} color={active ? "#245a41" : "#7b8580"} />
                      </Pressable>
                      <Pressable
                        style={styles.smallAction}
                        accessibilityLabel={`Excluir lista ${group.title}`}
                        onPress={() => requestDeleteGroup(group)}
                      >
                        <Trash2 size={15} color={active ? "#245a41" : "#7b8580"} />
                      </Pressable>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.mainPanel}>
            {loading ? (
              <View style={styles.centerState}>
                <ActivityIndicator color="#256f4c" />
              </View>
            ) : selectedGroup ? (
              <>
                <View style={styles.panelHeader}>
                  <View style={styles.panelTitleBlock}>
                    <Text style={styles.groupTitle}>{selectedGroup.title}</Text>
                    <Text style={styles.panelMeta}>
                      {completedCount} de {taskCount} concluido{taskCount === 1 ? "" : "s"}
                    </Text>
                  </View>
                  <Pressable style={styles.iconButton} onPress={() => startEditGroup(selectedGroup)}>
                    <Edit3 size={17} color="#13201a" />
                  </Pressable>
                </View>

                <View style={[styles.formRowWide, isNarrow && styles.formRowStack]}>
                  <TextInput
                    value={taskTitle}
                    onChangeText={setTaskTitle}
                    onSubmitEditing={createTask}
                    placeholder="Adicionar item"
                    placeholderTextColor="#7b8580"
                    style={styles.inputWide}
                  />
                  <View style={[styles.dateField, isNarrow && styles.dateFieldNarrow]}>
                    <Text style={styles.dateLabel}>Prazo da tarefa</Text>
                    <TextInput
                      value={taskDueDate}
                      onChangeText={(value) => setTaskDueDate(maskDateInput(value))}
                      placeholder="DD/MM/AAAA"
                      placeholderTextColor="#7b8580"
                      keyboardType="numeric"
                      maxLength={10}
                      style={[styles.dateInput, isNarrow && styles.dateInputNarrow]}
                    />
                    <Text style={styles.dateHint}>Opcional</Text>
                  </View>
                  <Pressable
                    style={[styles.primaryButton, isNarrow && styles.primaryButtonNarrow]}
                    onPress={createTask}
                    disabled={saving}
                  >
                    <Plus size={18} color="#ffffff" />
                    <Text style={styles.primaryButtonText}>Adicionar</Text>
                  </Pressable>
                </View>

                <ScrollView style={styles.taskList} contentContainerStyle={styles.taskListContent}>
                  {selectedGroup.tasks.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyTitle}>Nenhum item nesta lista.</Text>
                      <Text style={styles.emptyText}>Adicione o primeiro item para todos verem.</Text>
                    </View>
                  ) : (
                    selectedGroup.tasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        onToggle={toggleTask}
                        onEdit={startEditTask}
                        onDelete={requestDeleteTask}
                      />
                    ))
                  )}
                </ScrollView>
              </>
            ) : (
              <View style={styles.centerState}>
                <Text style={styles.emptyTitle}>Crie uma lista para comecar.</Text>
              </View>
            )}
          </View>
        </View>

        <EditGroupModal
          visible={Boolean(editingGroup)}
          editingGroup={editingGroup}
          saving={saving}
          onChange={setEditingGroup}
          onCancel={() => setEditingGroup(null)}
          onSave={saveGroupTitle}
        />
        <EditTaskModal
          visible={Boolean(editingTask)}
          editingTask={editingTask}
          saving={saving}
          onChange={setEditingTask}
          onCancel={() => setEditingTask(null)}
          onSave={saveTaskEdit}
        />
        <DeleteConfirmationModal
          visible={Boolean(confirmDelete)}
          item={confirmDelete}
          saving={saving}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={confirmDeleteItem}
        />
      </View>
    </SafeAreaView>
  );
}

function TaskRow({ task, onToggle, onEdit, onDelete }) {
  const overdue = isTaskOverdue(task);

  return (
    <View style={[styles.taskItem, overdue && styles.taskItemOverdue]}>
      <Pressable
        style={[styles.checkbox, task.completed && styles.checkboxChecked]}
        onPress={() => onToggle(task)}
      >
        {task.completed ? <Check size={16} color="#ffffff" /> : null}
      </Pressable>
      <View style={styles.taskContent}>
        <Text style={[styles.taskText, task.completed && styles.taskTextDone]}>{task.title}</Text>
        {task.dueDate ? (
          <Text style={[styles.dueDateText, overdue && styles.dueDateOverdue]}>
            Prazo: {formatDueDate(task.dueDate)}
          </Text>
        ) : null}
      </View>
      <View style={styles.rowActions}>
        <Pressable style={styles.deleteButton} onPress={() => onEdit(task)}>
          <Edit3 size={16} color="#7b8580" />
        </Pressable>
        <Pressable
          style={styles.deleteButton}
          accessibilityLabel={`Excluir item ${task.title}`}
          onPress={() => onDelete(task)}
        >
          <Trash2 size={17} color="#7b8580" />
        </Pressable>
      </View>
    </View>
  );
}

function EditGroupModal({ visible, editingGroup, saving, onChange, onCancel, onSave }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Editar lista</Text>
          <TextInput
            value={editingGroup?.title || ""}
            onChangeText={(title) => onChange({ ...editingGroup, title })}
            onSubmitEditing={onSave}
            placeholder="Nome da lista"
            placeholderTextColor="#7b8580"
            style={[styles.inputWide, styles.modalInput]}
          />
          <View style={styles.modalActions}>
            <Pressable style={styles.secondaryButton} onPress={onCancel} disabled={saving}>
              <Text style={styles.secondaryButtonText}>Cancelar</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={onSave} disabled={saving}>
              <Save size={16} color="#ffffff" />
              <Text style={styles.primaryButtonText}>Salvar</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function EditTaskModal({ visible, editingTask, saving, onChange, onCancel, onSave }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Editar item</Text>
          <TextInput
            value={editingTask?.title || ""}
            onChangeText={(title) => onChange({ ...editingTask, title })}
            onSubmitEditing={onSave}
            placeholder="Titulo do item"
            placeholderTextColor="#7b8580"
            style={[styles.inputWide, styles.modalInput]}
          />
          <TextInput
            value={editingTask?.dueDate || ""}
            onChangeText={(dueDate) => onChange({ ...editingTask, dueDate: maskDateInput(dueDate) })}
            placeholder="Prazo DD/MM/AAAA"
            placeholderTextColor="#7b8580"
            keyboardType="numeric"
            maxLength={10}
            style={[styles.inputWide, styles.modalInput]}
          />
          <Text style={styles.modalHint}>Data de prazo da tarefa. Opcional.</Text>
          <View style={styles.modalActions}>
            <Pressable style={styles.secondaryButton} onPress={onCancel} disabled={saving}>
              <Text style={styles.secondaryButtonText}>Cancelar</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={onSave} disabled={saving}>
              <Save size={16} color="#ffffff" />
              <Text style={styles.primaryButtonText}>Salvar</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DeleteConfirmationModal({ visible, item, saving, onCancel, onConfirm }) {
  const isGroup = item?.type === "group";
  const itemLabel = isGroup ? "lista" : "item";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalIcon}>
            <Trash2 size={22} color="#a33636" />
          </View>
          <Text style={styles.modalTitle}>Excluir {itemLabel}?</Text>
          <Text style={styles.modalText}>
            {isGroup
              ? "Esta lista e todos os itens dentro dela serao removidos."
              : "Este item sera removido da lista."}
          </Text>
          <Text style={styles.modalItemName} numberOfLines={2}>
            {item?.title}
          </Text>
          <View style={styles.modalActions}>
            <Pressable style={styles.secondaryButton} onPress={onCancel} disabled={saving}>
              <Text style={styles.secondaryButtonText}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={styles.dangerButton}
              accessibilityLabel="Confirmar exclusao"
              onPress={onConfirm}
              disabled={saving}
            >
              <Trash2 size={16} color="#ffffff" />
              <Text style={styles.dangerButtonText}>Excluir</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function replaceTask(groups, replacementTask) {
  return groups.map((group) =>
    group.id === replacementTask.groupId
      ? {
          ...group,
          tasks: group.tasks.map((task) =>
            task.id === replacementTask.id ? replacementTask : task
          )
        }
      : group
  );
}

function isTaskOverdue(task) {
  if (!task.dueDate || task.completed) {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(`${task.dueDate}T00:00:00`);
  return dueDate < today;
}

function formatDueDate(value) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatDueDateInput(value) {
  return value ? formatDueDate(value) : "";
}

function maskDateInput(value) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseDisplayDate(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!match) {
    return false;
  }

  const [, day, month, year] = match;
  const isoDate = `${year}-${month}-${day}`;
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== isoDate) {
    return false;
  }

  return isoDate;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f7f9f7"
  },
  appShell: {
    flex: 1,
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingVertical: 22
  },
  appShellNarrow: {
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 18
  },
  headerNarrow: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 10
  },
  titleBlock: {
    flex: 1,
    minWidth: 0
  },
  title: {
    color: "#13201a",
    fontSize: 34,
    fontWeight: "800",
    lineHeight: 40
  },
  titleNarrow: {
    fontSize: 30,
    lineHeight: 34
  },
  subtitle: {
    color: "#59645f",
    fontSize: 15,
    marginTop: 5
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff1f1",
    borderColor: "#f0caca",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12
  },
  errorText: {
    flex: 1,
    color: "#a33636",
    fontSize: 14
  },
  errorClose: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center"
  },
  content: {
    flex: 1,
    flexDirection: "row",
    gap: 18,
    minHeight: 0
  },
  contentNarrow: {
    flexDirection: "column"
  },
  sidebar: {
    width: 320,
    backgroundColor: "#ffffff",
    borderColor: "#dde4df",
    borderWidth: 1,
    borderRadius: 8,
    padding: 16
  },
  sidebarNarrow: {
    width: "100%",
    maxHeight: 280
  },
  sectionTitle: {
    color: "#13201a",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 12
  },
  formRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14
  },
  formRowWide: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 18
  },
  formRowStack: {
    flexDirection: "column",
    alignItems: "stretch"
  },
  input: {
    flex: 1,
    height: 42,
    borderColor: "#d9e1dc",
    borderWidth: 1,
    borderRadius: 8,
    color: "#13201a",
    backgroundColor: "#fbfcfb",
    paddingHorizontal: 12,
    fontSize: 14
  },
  inputWide: {
    flex: 1,
    height: 46,
    borderColor: "#d9e1dc",
    borderWidth: 1,
    borderRadius: 8,
    color: "#13201a",
    backgroundColor: "#fbfcfb",
    paddingHorizontal: 13,
    fontSize: 15
  },
  dateInput: {
    width: 140,
    height: 46,
    borderColor: "#d9e1dc",
    borderWidth: 1,
    borderRadius: 8,
    color: "#13201a",
    backgroundColor: "#fbfcfb",
    paddingHorizontal: 13,
    fontSize: 15
  },
  dateField: {
    width: 150
  },
  dateFieldNarrow: {
    width: "100%"
  },
  dateLabel: {
    color: "#13201a",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 4
  },
  dateHint: {
    color: "#7b8580",
    fontSize: 11,
    marginTop: 4
  },
  dateInputNarrow: {
    width: "100%"
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderColor: "#d9e1dc",
    borderWidth: 1
  },
  iconButtonNarrow: {
    alignSelf: "flex-end"
  },
  primaryIconButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#256f4c"
  },
  primaryButton: {
    height: 46,
    borderRadius: 8,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#256f4c"
  },
  primaryButtonNarrow: {
    paddingHorizontal: 12
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800"
  },
  groupList: {
    flex: 1
  },
  groupListContent: {
    gap: 8
  },
  groupItem: {
    minHeight: 64,
    borderRadius: 8,
    borderColor: "#e3e8e5",
    borderWidth: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  groupItemActive: {
    backgroundColor: "#edf7f1",
    borderColor: "#b9d8c7"
  },
  groupText: {
    flex: 1,
    minWidth: 0
  },
  groupName: {
    color: "#13201a",
    fontSize: 15,
    fontWeight: "750"
  },
  groupNameActive: {
    color: "#174b34"
  },
  groupMeta: {
    color: "#6d7872",
    fontSize: 12,
    marginTop: 4
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  smallAction: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  mainPanel: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#ffffff",
    borderColor: "#dde4df",
    borderWidth: 1,
    borderRadius: 8,
    padding: 20
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16
  },
  panelTitleBlock: {
    flex: 1,
    minWidth: 0
  },
  groupTitle: {
    color: "#13201a",
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 30
  },
  panelMeta: {
    color: "#59645f",
    fontSize: 14,
    marginTop: 4
  },
  taskList: {
    flex: 1
  },
  taskListContent: {
    gap: 10,
    paddingBottom: 8
  },
  taskItem: {
    minHeight: 58,
    borderRadius: 8,
    borderColor: "#e2e8e4",
    borderWidth: 1,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  taskItemOverdue: {
    borderColor: "#f0caca",
    backgroundColor: "#fffafa"
  },
  checkbox: {
    width: 25,
    height: 25,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#b8c4bd",
    alignItems: "center",
    justifyContent: "center"
  },
  checkboxChecked: {
    backgroundColor: "#256f4c",
    borderColor: "#256f4c"
  },
  taskContent: {
    flex: 1,
    minWidth: 0
  },
  taskText: {
    color: "#13201a",
    fontSize: 16,
    lineHeight: 22
  },
  taskTextDone: {
    color: "#819089",
    textDecorationLine: "line-through"
  },
  dueDateText: {
    color: "#68756e",
    fontSize: 12,
    marginTop: 3
  },
  dueDateOverdue: {
    color: "#a33636",
    fontWeight: "800"
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f6f8f6"
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  emptyState: {
    borderRadius: 8,
    borderColor: "#dce4df",
    borderWidth: 1,
    backgroundColor: "#f8faf8",
    padding: 22,
    alignItems: "center"
  },
  emptyTitle: {
    color: "#13201a",
    fontSize: 17,
    fontWeight: "800"
  },
  emptyText: {
    color: "#68756e",
    fontSize: 14,
    marginTop: 6
  },
  modalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(19, 32, 26, 0.34)",
    padding: 20
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 8,
    borderColor: "#d9e1dc",
    borderWidth: 1,
    backgroundColor: "#ffffff",
    padding: 22,
    shadowColor: "#13201a",
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 }
  },
  modalIcon: {
    width: 46,
    height: 46,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff1f1",
    borderColor: "#f0caca",
    borderWidth: 1,
    marginBottom: 14
  },
  modalTitle: {
    color: "#13201a",
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 28
  },
  modalText: {
    color: "#59645f",
    fontSize: 15,
    lineHeight: 21,
    marginTop: 8
  },
  modalInput: {
    flex: 0,
    width: "100%",
    marginTop: 14
  },
  modalHint: {
    color: "#7b8580",
    fontSize: 12,
    marginTop: 6
  },
  modalItemName: {
    color: "#13201a",
    fontSize: 15,
    fontWeight: "800",
    backgroundColor: "#f8faf8",
    borderColor: "#dce4df",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 14
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 18
  },
  secondaryButton: {
    height: 46,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    backgroundColor: "#ffffff",
    borderColor: "#d9e1dc",
    borderWidth: 1
  },
  secondaryButtonText: {
    color: "#13201a",
    fontSize: 14,
    fontWeight: "800"
  },
  dangerButton: {
    height: 46,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    backgroundColor: "#a33636"
  },
  dangerButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800"
  }
});
