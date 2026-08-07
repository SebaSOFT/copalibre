{{- define "copalibre.fullname" -}}
{{- .Release.Name }}
{{- end -}}

{{- define "copalibre.labels" -}}
app.kubernetes.io/name: copalibre
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}
