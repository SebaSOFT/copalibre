{{- define "copalibre.fullname" -}}
{{- .Release.Name }}
{{- end -}}

{{- define "copalibre.labels" -}}
app.kubernetes.io/name: copalibre
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Shared HorizontalPodAutoscaler body for one role, so the three enterprise HPA
templates (hpa-api.yaml, hpa-events.yaml, hpa-worker.yaml) can't structurally
drift from one another — only the role name and its autoscaling.<role>
config differ. Call with (dict "role" <name> "cfg" .Values.autoscaling.<name> "root" $).
*/}}
{{- define "copalibre.hpa" -}}
{{- $role := .role -}}
{{- $cfg := .cfg -}}
{{- $ := .root -}}
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ include "copalibre.fullname" $ }}-{{ $role }}
  labels:
    {{- include "copalibre.labels" $ | nindent 4 }}
    app.kubernetes.io/component: {{ $role }}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {{ include "copalibre.fullname" $ }}-{{ $role }}
  minReplicas: {{ $cfg.minReplicas }}
  maxReplicas: {{ $cfg.maxReplicas }}
  metrics:
    - type: External
      external:
        metric:
          name: {{ $cfg.metricName }}
          selector:
            matchLabels:
              app.kubernetes.io/instance: {{ $.Release.Name }}
              app.kubernetes.io/component: {{ $role }}
        target:
          type: AverageValue
          averageValue: {{ $cfg.targetAverageValue | quote }}
    {{- if $cfg.cpu.enabled }}
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: {{ $cfg.cpu.targetAverageUtilization }}
    {{- end }}
{{- end -}}
