"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { STUDENT_STATUS_OPTIONS } from "@/components/shared/status-badge";
import type { Database } from "@/lib/types/database";

type Student = Database["public"]["Tables"]["students"]["Row"];

interface StudentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student?: Student | null;
  onSaved?: () => void;
}

export function StudentFormDialog({ open, onOpenChange, student, onSaved }: StudentFormDialogProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [studentNumber, setStudentNumber] = useState("");
  const [admissionDate, setAdmissionDate] = useState("");
  const [status, setStatus] = useState("active");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setStudentNumber(student?.student_number ?? "");
      setAdmissionDate(student?.admission_date ?? new Date().toISOString().split("T")[0]);
      setStatus(student?.status ?? "active");
      setErrors({});
    }
  }, [open, student]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!studentNumber.trim()) e.studentNumber = "Le numéro de matricule est requis";
    if (!admissionDate) e.admissionDate = "La date d'admission est requise";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    if (!profile?.institution_id) {
      toast({ title: "Erreur", description: "Aucune institution associée à votre compte.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      if (student) {
        const { error } = await supabase
          .from("students")
          .update({
            student_number: studentNumber.trim(),
            admission_date: admissionDate,
            status,
          })
          .eq("id", student.id);

        if (error) throw error;
        toast({ title: "Étudiant modifié", description: "Les informations ont été mises à jour." });
      } else {
        const { error } = await supabase.from("students").insert({
          institution_id: profile.institution_id,
          student_number: studentNumber.trim(),
          admission_date: admissionDate,
          status,
        });

        if (error) throw error;
        toast({ title: "Étudiant créé", description: "Le dossier étudiant a été enregistré." });
      }

      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Une erreur est survenue.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{student ? "Modifier l'étudiant" : "Nouvel étudiant"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="student_number">Numéro de matricule *</Label>
            <Input
              id="student_number"
              value={studentNumber}
              onChange={(e) => setStudentNumber(e.target.value)}
              disabled={loading}
              placeholder="2026-0001"
            />
            {errors.studentNumber && <p className="text-xs text-destructive">{errors.studentNumber}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="admission_date">Date d'admission *</Label>
            <Input
              id="admission_date"
              type="date"
              value={admissionDate}
              onChange={(e) => setAdmissionDate(e.target.value)}
              disabled={loading}
            />
            {errors.admissionDate && <p className="text-xs text-destructive">{errors.admissionDate}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Statut</Label>
            <Select value={status} onValueChange={setStatus} disabled={loading}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STUDENT_STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {student ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
