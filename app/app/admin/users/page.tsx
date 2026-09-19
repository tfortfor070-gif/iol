"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingState } from "@/components/shared/loading-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/types/database";
import { Plus, Search, MoveHorizontal as MoreHorizontal, UserCog, Loader as Loader2, ShieldCheck, Mail } from "lucide-react";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

type ProfileWithRoles = Profile & {
  user_roles?: { role_id: string; roles: { code: string; name: string } }[];
};

const ROLE_OPTIONS = [
  { value: "super_admin", label: "Super Administrateur" },
  { value: "direction", label: "Direction" },
  { value: "administration", label: "Administration" },
  { value: "scolarite", label: "Scolarité" },
  { value: "comptabilite", label: "Comptabilité" },
  { value: "formateur", label: "Formateur" },
  { value: "etudiant", label: "Étudiant" },
];

const ROLE_LABELS: Record<string, string> = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r.label]));

const SENSITIVE_ROLES = ["super_admin", "direction"];

export default function UsersPage() {
  const { permissions, roles: currentUserRoles, profile: currentUser } = useAuth();
  const { toast } = useToast();

  const [users, setUsers] = useState<ProfileWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [roleDialogUser, setRoleDialogUser] = useState<ProfileWithRoles | null>(null);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState("");
  const [savingRole, setSavingRole] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const canCreate = permissions.includes("users.create" as never);
  const canUpdate = permissions.includes("users.update" as never);
  const isSuperAdmin = currentUserRoles.includes("super_admin");

  const fetchUsers = useCallback(async () => {
    if (!currentUser?.institution_id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, user_roles(role_id, roles(code, name))")
        .eq("institution_id", currentUser.institution_id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setUsers((data as ProfileWithRoles[]) ?? []);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.institution_id]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const filtered = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return `${u.last_name} ${u.first_name}`.toLowerCase().includes(q);
  }).filter((u) => {
    if (roleFilter === "all") return true;
    const userRoleCodes = u.user_roles?.map((ur) => ur.roles.code) ?? [];
    return userRoleCodes.includes(roleFilter);
  });

  const handleToggleActive = async (user: ProfileWithRoles) => {
    setTogglingId(user.id);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          action: "toggle_active",
          user_id: user.id,
          is_active: !user.is_active,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Erreur");
      }

      toast({ title: user.is_active ? "Utilisateur désactivé" : "Utilisateur activé" });
      fetchUsers();
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Une erreur est survenue.", variant: "destructive" });
    } finally {
      setTogglingId(null);
    }
  };

  const openRoleDialog = (user: ProfileWithRoles) => {
    const currentRole = user.user_roles?.[0]?.roles.code ?? "";
    setSelectedRole(currentRole);
    setRoleDialogUser(user);
    setRoleDialogOpen(true);
  };

  const handleSaveRole = async () => {
    if (!roleDialogUser || !selectedRole || !currentUser?.institution_id) return;

    if (SENSITIVE_ROLES.includes(selectedRole) && !isSuperAdmin) {
      toast({ title: "Accès refusé", description: "Seul un super admin peut attribuer ce rôle.", variant: "destructive" });
      return;
    }

    setSavingRole(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          action: "assign_role",
          user_id: roleDialogUser.id,
          role_code: selectedRole,
          institution_id: currentUser.institution_id,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Erreur");
      }

      toast({ title: "Rôle mis à jour", description: `${roleDialogUser.first_name} ${roleDialogUser.last_name} → ${ROLE_LABELS[selectedRole]}` });
      setRoleDialogOpen(false);
      setRoleDialogUser(null);
      fetchUsers();
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Une erreur est survenue.", variant: "destructive" });
    } finally {
      setSavingRole(false);
    }
  };

  if (loading) {
    return <div><PageHeader title="Utilisateurs" description="Gestion des comptes et rôles" /><LoadingState /></div>;
  }

  return (
    <div>
      <PageHeader
        title="Utilisateurs"
        description="Gestion des comptes, rôles et permissions"
        action={canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Nouvel utilisateur
          </Button>
        )}
      />

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Rechercher par nom..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Tous les rôles" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les rôles</SelectItem>
              {ROLE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState title="Aucun utilisateur" message={canCreate ? "Créez votre premier utilisateur." : "Aucun utilisateur trouvé."} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Créé le</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => {
                  const roleCode = u.user_roles?.[0]?.roles.code ?? "";
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={u.avatar_url ?? undefined} />
                            <AvatarFallback className="text-xs bg-primary text-white">
                              {`${u.first_name[0] ?? ""}${u.last_name[0] ?? ""}`.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">{u.first_name} {u.last_name}</p>
                            {u.phone && <p className="text-xs text-muted-foreground">{u.phone}</p>}
                          </div>
                          {isSelf && <Badge variant="outline" className="text-xs">Vous</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {roleCode ? (
                          <Badge variant={SENSITIVE_ROLES.includes(roleCode) ? "default" : "secondary"}>
                            {ROLE_LABELS[roleCode] ?? roleCode}
                          </Badge>
                        ) : (
                          <Badge variant="outline">Aucun rôle</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.is_active ? "default" : "destructive"}>
                          {u.is_active ? "Actif" : "Inactif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(u.created_at).toLocaleDateString("fr-FR")}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canUpdate && (
                              <DropdownMenuItem onClick={() => openRoleDialog(u)}>
                                <UserCog className="w-4 h-4 mr-2" /> Changer le rôle
                              </DropdownMenuItem>
                            )}
                            {canUpdate && !isSelf && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  disabled={togglingId === u.id}
                                  onClick={() => handleToggleActive(u)}
                                >
                                  {u.is_active ? "Désactiver" : "Activer"}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {canCreate && (
        <CreateUserDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          institutionId={currentUser?.institution_id ?? ""}
          onSaved={fetchUsers}
        />
      )}

      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Changer le rôle</DialogTitle>
            <DialogDescription>
              {roleDialogUser && `${roleDialogUser.first_name} ${roleDialogUser.last_name}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Rôle *</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger><SelectValue placeholder="Sélectionner un rôle" /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem
                      key={r.value}
                      value={r.value}
                      disabled={SENSITIVE_ROLES.includes(r.value) && !isSuperAdmin}
                    >
                      {r.label}
                      {SENSITIVE_ROLES.includes(r.value) && !isSuperAdmin && " (réservé)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedRole && SENSITIVE_ROLES.includes(selectedRole) && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm">
                <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Ce rôle donne un accès élevé. Attribution réservée au super admin.</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)} disabled={savingRole}>Annuler</Button>
            <Button onClick={handleSaveRole} disabled={savingRole || !selectedRole}>
              {savingRole && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateUserDialog({
  open, onOpenChange, institutionId, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId: string;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const { roles: currentUserRoles } = useAuth();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [roleCode, setRoleCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isSuperAdmin = currentUserRoles.includes("super_admin");

  useEffect(() => {
    if (open) {
      setEmail(""); setPassword(""); setFirstName(""); setLastName(""); setPhone(""); setRoleCode("");
      setErrors({});
    }
  }, [open]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!email.trim()) e.email = "L'email est requis";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Email invalide";
    if (password.length < 6) e.password = "Le mot de passe doit faire au moins 6 caractères";
    if (!firstName.trim()) e.firstName = "Le prénom est requis";
    if (!lastName.trim()) e.lastName = "Le nom est requis";
    if (!roleCode) e.roleCode = "Le rôle est requis";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    if (SENSITIVE_ROLES.includes(roleCode) && !isSuperAdmin) {
      toast({ title: "Accès refusé", description: "Seul un super admin peut créer ce type de compte.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          action: "create_user",
          email: email.trim(),
          password,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim() || undefined,
          institution_id: institutionId,
          role_code: roleCode,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erreur lors de la création");

      toast({ title: "Utilisateur créé", description: `${firstName} ${lastName} peut maintenant se connecter.` });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Une erreur est survenue.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Nouvel utilisateur</DialogTitle>
          <DialogDescription>Créez un compte et attribuez-lui un rôle.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nu-firstname">Prénom *</Label>
              <Input id="nu-firstname" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={loading} autoFocus />
              {errors.firstName && <p className="text-xs text-destructive">{errors.firstName}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="nu-lastname">Nom *</Label>
              <Input id="nu-lastname" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={loading} />
              {errors.lastName && <p className="text-xs text-destructive">{errors.lastName}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="nu-email">Email *</Label>
            <Input id="nu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} placeholder="utilisateur@centre.edu" />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nu-password">Mot de passe *</Label>
              <Input id="nu-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} />
              {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="nu-phone">Téléphone</Label>
              <Input id="nu-phone" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={loading} placeholder="+221 ..." />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="nu-role">Rôle *</Label>
            <Select value={roleCode} onValueChange={setRoleCode} disabled={loading}>
              <SelectTrigger id="nu-role"><SelectValue placeholder="Sélectionner un rôle" /></SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem
                    key={r.value}
                    value={r.value}
                    disabled={SENSITIVE_ROLES.includes(r.value) && !isSuperAdmin}
                  >
                    {r.label}
                    {SENSITIVE_ROLES.includes(r.value) && !isSuperAdmin && " (réservé)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.roleCode && <p className="text-xs text-destructive">{errors.roleCode}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Annuler</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Mail className="w-4 h-4 mr-2" />
              Créer le compte
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
