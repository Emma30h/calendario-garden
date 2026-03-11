import { z } from "zod";

export const SIGNUP_PERSONAL_TYPES = [
  "Oficial",
  "Suboficial",
  "Tecnico",
  "Civil",
] as const;

export const SIGNUP_OFICIAL_HIERARCHIES = [
  "Oficial Ayudante",
  "Oficial Subinspector",
  "Oficial Inspector",
  "Oficial Principal",
  "Subcomisario",
  "Comisario",
  "Comisario Inspector",
  "Comisario Mayor",
  "Comisario General",
] as const;

export const SIGNUP_SUBOFICIAL_HIERARCHIES = [
  "Agente",
  "Cabo",
  "Cabo Primero",
  "Sargento",
  "Sargento Primero",
  "Sargento Ayudante",
  "Suboficial Principal",
  "Suboficial Mayor",
] as const;

export const SIGNUP_AREA_CATEGORIES = [
  "D.M.C.A (Dirección Monitoreo Cordobeses en Alerta)",
  "Departamento Alerta Ciudadana",
  "Departamento Socio-Educativo",
] as const;

export type SignupPersonalType = (typeof SIGNUP_PERSONAL_TYPES)[number];

function normalizeInputText(value: string) {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function sanitizePersonNameInput(value: string) {
  return value
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\s.'-]/gu, "")
    .replace(/\s+/g, " ");
}

function normalizePersonName(value: string) {
  return sanitizePersonNameInput(value).trim();
}

export function getSignupHierarchyOptions(
  personalType: SignupPersonalType
): readonly string[] {
  if (personalType === "Oficial") {
    return SIGNUP_OFICIAL_HIERARCHIES;
  }

  if (personalType === "Suboficial" || personalType === "Tecnico") {
    return SIGNUP_SUBOFICIAL_HIERARCHIES;
  }

  return [];
}

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Debes ingresar un e-mail.")
  .max(320, "El e-mail es demasiado largo.")
  .email("Debes ingresar un e-mail valido.");

const loginPasswordSchema = z
  .string()
  .min(1, "Debes ingresar una contrasena.")
  .max(72, "La contrasena es demasiado larga.");

const personNameSchema = z.preprocess(
  (value) => (typeof value === "string" ? normalizePersonName(value) : value),
  z
    .string()
    .min(1, "Debes ingresar este campo.")
    .max(120, "El texto es demasiado largo.")
);

const signupPersonalTypeSchema = z.preprocess(
  (value) => (typeof value === "string" ? normalizeInputText(value) : value),
  z.enum(SIGNUP_PERSONAL_TYPES, {
    message: "Selecciona un tipo de personal policial.",
  })
);

const signupHierarchySchema = z.preprocess(
  (value) => (typeof value === "string" ? normalizeInputText(value) : ""),
  z.string().max(120, "La jerarquia es demasiado larga.")
);

const signupAreaSchema = z.preprocess(
  (value) => (typeof value === "string" ? normalizeInputText(value) : value),
  z.enum(SIGNUP_AREA_CATEGORIES, {
    message: "Selecciona un area valida.",
  })
);

export type PasswordRuleCheck = {
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
};

export function evaluatePasswordRules(password: string): PasswordRuleCheck {
  return {
    hasMinLength: password.length >= 7,
    hasUppercase: /[A-Z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecialChar: /[^A-Za-z0-9]/.test(password),
  };
}

function isPasswordValidByRules(password: string) {
  const checks = evaluatePasswordRules(password);
  return (
    checks.hasMinLength &&
    checks.hasUppercase &&
    checks.hasNumber &&
    checks.hasSpecialChar
  );
}

const signupPasswordSchema = z
  .string()
  .max(72, "La contrasena es demasiado larga.")
  .refine(isPasswordValidByRules, {
    message:
      "La contrasena debe tener mas de 6 caracteres, una mayuscula, un numero y un caracter especial.",
  });

const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "El codigo debe tener 6 digitos.");

const signupPayloadBaseSchema = z.object({
  email: emailSchema,
  firstName: personNameSchema,
  lastName: personNameSchema,
  personalType: signupPersonalTypeSchema,
  hierarchy: signupHierarchySchema,
  area: signupAreaSchema,
  password: signupPasswordSchema,
  confirmPassword: loginPasswordSchema,
});

function validateSignupPayload(
  value: z.infer<typeof signupPayloadBaseSchema>,
  ctx: z.RefinementCtx
) {
  if (value.password !== value.confirmPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Las contrasenas no coinciden.",
      path: ["confirmPassword"],
    });
  }

  if (value.personalType === "Civil") {
    return;
  }

  if (!value.hierarchy) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Selecciona una jerarquia.",
      path: ["hierarchy"],
    });
    return;
  }

  const hierarchyOptions = getSignupHierarchyOptions(value.personalType);
  if (!hierarchyOptions.includes(value.hierarchy)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Selecciona una jerarquia valida para el tipo de personal.",
      path: ["hierarchy"],
    });
  }
}

export const loginPayloadSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
});

export const signupPayloadSchema =
  signupPayloadBaseSchema.superRefine(validateSignupPayload);

export const adminCreateUserPayloadSchema =
  signupPayloadBaseSchema.superRefine(validateSignupPayload);

export const requestOtpPayloadSchema = z.object({
  email: emailSchema,
});

export const verifyOtpPayloadSchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
});

export const requestPasswordResetPayloadSchema = z.object({
  email: emailSchema,
});

const resetPasswordPayloadBaseSchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
  password: signupPasswordSchema,
  confirmPassword: loginPasswordSchema,
});

export const resetPasswordPayloadSchema = resetPasswordPayloadBaseSchema.superRefine(
  (value, ctx) => {
    if (value.password !== value.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Las contrasenas no coinciden.",
        path: ["confirmPassword"],
      });
    }
  }
);

const changePasswordPayloadBaseSchema = z.object({
  currentPassword: loginPasswordSchema,
  newPassword: signupPasswordSchema,
  confirmPassword: loginPasswordSchema,
});

export const changePasswordPayloadSchema =
  changePasswordPayloadBaseSchema.superRefine((value, ctx) => {
    if (value.newPassword !== value.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Las contraseñas no coinciden.",
        path: ["confirmPassword"],
      });
    }

    if (value.currentPassword === value.newPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La nueva contraseña debe ser distinta de la actual.",
        path: ["newPassword"],
      });
    }
  });

export type LoginPayload = z.infer<typeof loginPayloadSchema>;
export type SignupPayload = z.infer<typeof signupPayloadSchema>;
export type AdminCreateUserPayload = z.infer<typeof adminCreateUserPayloadSchema>;
export type RequestOtpPayload = z.infer<typeof requestOtpPayloadSchema>;
export type VerifyOtpPayload = z.infer<typeof verifyOtpPayloadSchema>;
export type RequestPasswordResetPayload = z.infer<
  typeof requestPasswordResetPayloadSchema
>;
export type ResetPasswordPayload = z.infer<typeof resetPasswordPayloadSchema>;
export type ChangePasswordPayload = z.infer<typeof changePasswordPayloadSchema>;
